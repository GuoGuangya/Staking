// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "hardhat/console.sol";

// 通过质押平台的代币获取收益
contract Staking is Ownable {
    using SafeERC20 for IERC20;

    struct User {
        uint amount; // 质押的平台代币数量
        uint yield; // 收益
        uint theoreticalYield; // 按照每个share的收益量，理论上收益的数
        uint withDrawYield; // 已经提取走的收益
    }

    // 质押池
    struct Pool {
        address projectLeader; // 项目方地址
        IERC20 lpToken; // 收益的token
        uint[] totalLpSupply;
        uint startTime; // 开始时间
        uint endTime; // 结束时间
        uint[] perLpRewards; // 每个token的收益
        uint[] latestUpdateTimes; // 上次更新的时间
        IERC20[] pledgeToken; // 需要质押的token
        uint[] perSecondsRewards; // 每秒的收益
        uint[] noAllocatedRewards; // 没有分配的收益
    }

    Pool[] public pools; // 质押池
    mapping(uint => mapping(address => User[])) public users;

    constructor() Ownable(msg.sender) {}

    function getPoolsLength() external view returns (uint) {
        return pools.length;
    }

    event AddPool(
        uint indexed pid,
        IERC20 _yieldToekn,
        uint _startTime,
        uint _durationSenconds,
        IERC20[] _pledgeToken,
        uint[] _perSecondsRewards,
        address _projectLeader
    );

    event Deposit(
        uint indexed pid,
        address indexed user,
        uint indexed tokenIndex,
        uint amount
    );

    event ProjectLeaderWithDraw(uint indexed pid, address indexed user);

    event WithdrawPledge(
        uint indexed pid,
        address indexed user,
        uint indexed tokenIndex,
        uint amount
    );
    
    event WithdrawRewards(
        uint indexed pid,
        address indexed user,
        uint indexed tokenIndex,
        uint amount
    );

    function addPool(
        IERC20 _yieldToekn, // 收益的token
        uint _startTime, // 开始时间
        uint _durationSenconds, //持续的时间
        IERC20[] memory _pledgeToken, // 需要质押的token
        uint[] memory _perSecondsRewards, // 每秒的收益
        address _projectLeader // 项目方账户地址
    ) external onlyOwner {
        require(block.timestamp < _startTime, "now > start time");
        require(
            _pledgeToken.length > 0 &&
                _pledgeToken.length == _perSecondsRewards.length,
            "array length not eq"
        );

        uint[] memory _totalLpSupply = new uint[](_pledgeToken.length);
        // 先把奖金转进来
        uint totalRewards;
        uint[] memory _latestUpdateTimes = new uint[](_pledgeToken.length);
        for (uint i = 0; i < _pledgeToken.length; i++) {
            _totalLpSupply[i] = _perSecondsRewards[i] * _durationSenconds;
            totalRewards += _totalLpSupply[i];
            _latestUpdateTimes[i] = block.timestamp;
        }

        _yieldToekn.safeTransferFrom(msg.sender, address(this), totalRewards);

        pools.push(
            Pool({
                projectLeader: _projectLeader,
                lpToken: _yieldToekn,
                totalLpSupply: new uint[](_pledgeToken.length),
                startTime: _startTime,
                endTime: _startTime + _durationSenconds,
                perLpRewards: new uint[](_pledgeToken.length),
                latestUpdateTimes: _latestUpdateTimes,
                pledgeToken: _pledgeToken,
                perSecondsRewards: _perSecondsRewards,
                noAllocatedRewards: _totalLpSupply
            })
        );

        emit AddPool(
            pools.length - 1,
            _yieldToekn,
            _startTime,
            _durationSenconds,
            _pledgeToken,
            _perSecondsRewards,
            _projectLeader
        );
    }

    // 质押代币
    function deposit(uint pid, uint tokenIndex, uint amount) external {
        Pool storage pool = pools[pid];
        require(amount > 0, "amount should not eq 0");
        require(block.timestamp >= pool.startTime, "Not start");
        uptePoolRewards(pid, tokenIndex);

        pool.pledgeToken[tokenIndex].safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        if (users[pid][msg.sender].length == 0) {
            for (uint i; i < pool.pledgeToken.length; i++) {
                // 初始化，向里面添加元素
                users[pid][msg.sender].push(User(0, 0, 0, 0));
            }
        }

        User storage user = users[pid][msg.sender][tokenIndex];

        user.yield +=
            user.amount *
            pool.perLpRewards[tokenIndex] -
            user.theoreticalYield;

        user.amount += amount;
        user.theoreticalYield = user.amount * pool.perLpRewards[tokenIndex];

        pool.totalLpSupply[tokenIndex] += amount;
        emit Deposit(pid, msg.sender, tokenIndex, amount);
    }

    // 取出质押的代币
    function withdrawPledge(uint pid, uint tokenIndex, uint amount) public {
        require(users[pid][msg.sender].length != 0, "not exist this user");

        User storage user = users[pid][msg.sender][tokenIndex];

        require(user.amount >= amount, "balance < amount");

        Pool storage pool = pools[pid];
        require(amount > 0, "amount should not eq 0");
        uptePoolRewards(pid, tokenIndex);

        user.yield +=
            user.amount *
            pool.perLpRewards[tokenIndex] -
            user.theoreticalYield;

        user.amount -= amount;
        user.theoreticalYield = user.amount * pool.perLpRewards[tokenIndex];
        pool.totalLpSupply[tokenIndex] -= amount;
        pool.pledgeToken[tokenIndex].safeTransfer(msg.sender, amount);
        emit WithdrawPledge(pid, msg.sender, tokenIndex, amount);
    }

    // 取走获得的奖金
    function withdrawRewards(uint pid, uint tokenIndex, uint amount) public {
        require(amount > 0, "amount should not eq 0");
        require(users[pid][msg.sender].length != 0, "not exist this user");

        User storage user = users[pid][msg.sender][tokenIndex];
        require(user.yield - user.withDrawYield >= amount, "balance < amount");

        Pool storage pool = pools[pid];

        user.yield -= amount;
        user.withDrawYield += amount;
        pool.pledgeToken[tokenIndex].safeTransfer(msg.sender, amount);
        emit WithdrawRewards(pid, msg.sender, tokenIndex, amount);
    }

    // 取走质押的金额和奖金
    function withdraw(uint pid, uint tokenIndex) external {
        User storage user = users[pid][msg.sender][tokenIndex];
        withdrawPledge(pid, tokenIndex, user.amount);
        withdrawRewards(pid, tokenIndex, user.yield - user.withDrawYield);
    }

    // 更新一个池中的所有奖金
    function uptePoolsRewards(uint pid) public {
        for (uint i; i < pools[pid].pledgeToken.length; i++) {
            uptePoolRewards(pid, i);
        }
    }

    // 更新奖励的金额
    function uptePoolRewards(uint pid, uint tokenIndex) public {
        Pool storage pool = pools[pid];

        uint minTimestamp = block.timestamp > pool.endTime
            ? pool.endTime
            : block.timestamp;

        // 如果池没有开始，或者已经结束（上次计算的时间是结束时间）
        if (
            pool.startTime > block.timestamp ||
            minTimestamp == pool.latestUpdateTimes[tokenIndex]
        ) {
            return;
        }

        // 如果质押的数量为0，则不用统计
        if (pool.totalLpSupply[tokenIndex] == 0) {
            pool.latestUpdateTimes[tokenIndex] = minTimestamp;
            pool.noAllocatedRewards[tokenIndex] +=
                (minTimestamp - pool.latestUpdateTimes[tokenIndex]) *
                pool.perSecondsRewards[tokenIndex] *
                1e36;
            return;
        }

        uint duraction = minTimestamp - pool.latestUpdateTimes[tokenIndex];

        pool.perLpRewards[tokenIndex] +=
            (pool.perSecondsRewards[tokenIndex] * duraction * 1e36) /
            pool.totalLpSupply[tokenIndex];

        pool.latestUpdateTimes[tokenIndex] = minTimestamp;
    }

    // 更新所有的池
    function updatePools() public {
        for (uint i; i < pools.length; i++) {
            uptePoolsRewards(i);
        }
    }

    // 项目方来取走没有分配的空投剩余代币
    function projectLeaderWithDraw(uint pid) external {
        Pool storage pool = pools[pid];
        require(msg.sender == pool.projectLeader, "not project leader");
        require(block.timestamp >= pool.endTime, "not end!");
        uint amount;
        for (uint i; i < pool.perLpRewards.length; i++) {
            amount += pool.noAllocatedRewards[i];
        }
        pool.lpToken.safeTransfer(msg.sender, amount);
        emit ProjectLeaderWithDraw(pid, msg.sender);
    }

    // 获取用户没有提取的奖励数量
    function getUserNotWithDrawRewards(
        uint pid,
        uint tokenIndex
    ) public view returns (uint) {
        Pool storage pool = pools[pid];

        uint minTimestamp = block.timestamp > pool.endTime
            ? pool.endTime
            : block.timestamp;

        if (0 == users[pid][msg.sender].length) {
            return 0;
        }

        User storage user = users[pid][msg.sender][tokenIndex];

        // 如果池没有开始，或者已经结束（上次计算的时间是结束时间）
        if (
            pool.startTime > block.timestamp ||
            minTimestamp == pool.latestUpdateTimes[tokenIndex] ||
            pool.totalLpSupply[tokenIndex] == 0
            // 如果质押的数量为0，则不用统计
        ) {
            return ((user.amount * pool.perLpRewards[tokenIndex]) /
                1e36 -
                user.withDrawYield +
                user.yield);
        }

        uint duraction = minTimestamp - pool.latestUpdateTimes[tokenIndex];
        // 每个LP的奖励 = 之前每个LP的奖励 + (间隔) * 每秒的奖励 * LP's user / total LP
        uint perLpRewards = pool.perLpRewards[tokenIndex] +
            (pool.perSecondsRewards[tokenIndex] * duraction * 1e36) /
            pool.totalLpSupply[tokenIndex]; //得到实际的奖励金额

        return
            (user.amount *
                perLpRewards -
                user.theoreticalYield +
                user.yield -
                user.withDrawYield) / 1e36;
    }
}

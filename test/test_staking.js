const hre = require("hardhat");
const { expect, assert } = require("chai");

describe("", () => {
    let staking
    let BTC
    let pledgeToken
    let deployer
    let alice
    let bob
    let projectLeader
    let usdt, usdc

    beforeEach(async () => {
        const Staking = await hre.ethers.getContractFactory("Staking")
        staking = await Staking.deploy()

        const Token = await hre.ethers.getContractFactory("Token")
        BTC = await Token.deploy("BTC", "BTC")
        pledgeToken = [await Token.deploy("USDT", "USDT"), await Token.deploy("USDC", "USDC")]

        const signer = await hre.ethers.getSigners(); // 获取当前账户的Signer对象

        usdt = pledgeToken[0]
        usdc = pledgeToken[1]

        deployer = signer[0]
        alice = signer[1]
        bob = signer[2]
        projectLeader = signer[3]
    })

    context("Add Pools", async function () {
        it("Add correct Pool", async () => {
            await BTC.mint(hre.ethers.parseEther("1000000"))
            await BTC.approve(staking.target, hre.ethers.parseEther("1000000"))

            const startTime = (await hre.ethers.provider.getBlock('latest')).timestamp + 60
            const durationSenconds = 60n * 60n * 3n
            await staking.addPool(BTC.target, startTime, durationSenconds,
                [pledgeToken[0].target, pledgeToken[1].target], [hre.ethers.parseEther("0.001"), hre.ethers.parseEther("0.0001")], projectLeader)

            expect(await staking.getPoolsLength()).to.eq(1)
            expect(await BTC.balanceOf(deployer)).to.eq(hre.ethers.parseEther("1000000") - (hre.ethers.parseEther("0.001") + hre.ethers.parseEther("0.0001")) * durationSenconds)
            expect(await BTC.balanceOf(staking.target)).to.eq((hre.ethers.parseEther("0.001") + hre.ethers.parseEther("0.0001")) * durationSenconds)
        })

        it("Add wrong startTime", async () => {
            await BTC.mint(hre.ethers.parseEther("1000000"))
            await BTC.approve(staking.target, hre.ethers.parseEther("1000000"))

            const startTime = (await hre.ethers.provider.getBlock('latest')).timestamp - 60
            const durationSenconds = 60 * 60 * 3
            await expect(staking.addPool(BTC.target, startTime, durationSenconds,
                [pledgeToken[0].target, pledgeToken[1].target], [hre.ethers.parseEther("0.001"), hre.ethers.parseEther("0.0001")], projectLeader)).to.revertedWith('now > start time')
        })

        it("Add array not eq startTime", async () => {
            await BTC.mint(hre.ethers.parseEther("1000000"))
            await BTC.approve(staking.target, hre.ethers.parseEther("1000000"))

            const startTime = (await hre.ethers.provider.getBlock('latest')).timestamp + 60
            const durationSenconds = 60 * 60 * 3
            await expect(staking.addPool(BTC.target, startTime, durationSenconds,
                [pledgeToken[0].target, pledgeToken[1].target], [hre.ethers.parseEther("0.001")], projectLeader)).to.revertedWith('array length not eq')
            await expect(staking.addPool(BTC.target, startTime, durationSenconds,
                [pledgeToken[0].target], [1000, 100], projectLeader)).to.revertedWith('array length not eq')
        })
    })

    context("Deposit coin to staking", async () => {
        it("Depost coin correct", async () => {
            await pledgeToken[0].mint(hre.ethers.parseEther("10"))
            await pledgeToken[1].mint(hre.ethers.parseEther("20"))
            await pledgeToken[0].approve(staking.target, hre.ethers.parseEther("10"))
            await pledgeToken[1].approve(staking.target, hre.ethers.parseEther("20"))

            await BTC.mint(hre.ethers.parseEther("1000000"))
            await BTC.approve(staking.target, hre.ethers.parseEther("1000000"))

            const startTime = (await hre.ethers.provider.getBlock('latest')).timestamp + 60
            const durationSenconds = 60n * 60n * 3n
            await staking.addPool(BTC.target, startTime, durationSenconds,
                [pledgeToken[0].target, pledgeToken[1].target], [hre.ethers.parseEther("0.01"), hre.ethers.parseEther("0.001")], projectLeader)

            expect(await staking.getPoolsLength()).to.eq(1)
            expect(await BTC.balanceOf(deployer)).to.eq(hre.ethers.parseEther("1000000") - (hre.ethers.parseEther("0.01") + hre.ethers.parseEther("0.001")) * durationSenconds)
            expect(await BTC.balanceOf(staking.target)).to.eq((hre.ethers.parseEther("0.01") + hre.ethers.parseEther("0.001")) * durationSenconds)

            // 暂停自动挖矿
            await hre.network.provider.send("evm_setAutomine", [false]);
            // 质押代币
            await ethers.provider.send('evm_setNextBlockTimestamp', [startTime + 10]); // 30 seconds before endTimestamp
            await ethers.provider.send('evm_mine', []); // Mine a block to apply the new timestamp

            await staking.deposit(0, 0, hre.ethers.parseEther("10"), { gasLimit: 1000000 });
            await staking.deposit(0, 1, hre.ethers.parseEther("20"), { gasLimit: 1000000 });
            await ethers.provider.send('evm_mine', []);
            await hre.network.provider.send("evm_setAutomine", [true]);// 恢复自动挖矿


            expect(await pledgeToken[0].balanceOf(staking.target)).to.eq(hre.ethers.parseEther("10"))
            expect(await pledgeToken[1].balanceOf(staking.target)).to.eq(hre.ethers.parseEther("20"))
            expect(await pledgeToken[0].balanceOf(deployer)).to.eq(0)
            expect(await pledgeToken[1].balanceOf(deployer)).to.eq(0)

            await ethers.provider.send('evm_setNextBlockTimestamp', [(await hre.ethers.provider.getBlock('latest')).timestamp + 30]); // 30 seconds before endTimestamp
            await ethers.provider.send('evm_mine', []); // Mine a block to apply the new timestamp
            // 获取60秒之后，质押代币获取到的收入
            expect(await staking.getUserNotWithDrawRewards(0, 0)).to.eq(hre.ethers.parseEther("0.01") * 30n)
            expect(await staking.getUserNotWithDrawRewards(0, 1)).to.eq(hre.ethers.parseEther("0.001") * 30n)
        })

        it("Depost coin number = 0", async () => {
            await pledgeToken[0].mint(hre.ethers.parseEther("10"))
            await pledgeToken[1].mint(hre.ethers.parseEther("20"))
            await pledgeToken[0].approve(staking.target, hre.ethers.parseEther("10"))
            await pledgeToken[1].approve(staking.target, hre.ethers.parseEther("20"))


            await BTC.mint(hre.ethers.parseEther("1000000"))
            await BTC.approve(staking.target, hre.ethers.parseEther("1000000"))

            const startTime = (await hre.ethers.provider.getBlock('latest')).timestamp + 60
            const durationSenconds = 60n * 60n * 3n
            await staking.addPool(BTC.target, startTime, durationSenconds,
                [pledgeToken[0].target, pledgeToken[1].target], [hre.ethers.parseEther("0.01"), hre.ethers.parseEther("0.001")], projectLeader)

            expect(await staking.getPoolsLength()).to.eq(1)
            expect(await BTC.balanceOf(deployer)).to.eq(hre.ethers.parseEther("1000000") - (hre.ethers.parseEther("0.01") + hre.ethers.parseEther("0.001")) * durationSenconds)
            expect(await BTC.balanceOf(staking.target)).to.eq((hre.ethers.parseEther("0.01") + hre.ethers.parseEther("0.001")) * durationSenconds)

            await expect(staking.deposit(0, 0, hre.ethers.parseEther("0"))).to.revertedWith('amount should not eq 0')
            await expect(staking.deposit(0, 1, hre.ethers.parseEther("0"))).to.revertedWith('amount should not eq 0')
        })

        it("Deposit coin", async () => {
            await pledgeToken[0].mint(hre.ethers.parseEther("2"))
            await pledgeToken[1].mint(hre.ethers.parseEther("2"))
            await pledgeToken[0].approve(staking.target, hre.ethers.parseEther("2"))
            await pledgeToken[1].approve(staking.target, hre.ethers.parseEther("2"))

            await pledgeToken[0].connect(alice).mint(hre.ethers.parseEther("4"))
            await pledgeToken[1].connect(alice).mint(hre.ethers.parseEther("4"))
            await pledgeToken[0].connect(alice).approve(staking.target, hre.ethers.parseEther("4"))
            await pledgeToken[1].connect(alice).approve(staking.target, hre.ethers.parseEther("4"))

            await pledgeToken[0].connect(bob).mint(hre.ethers.parseEther("4"))
            await pledgeToken[1].connect(bob).mint(hre.ethers.parseEther("4"))
            await pledgeToken[0].connect(bob).approve(staking.target, hre.ethers.parseEther("4"))
            await pledgeToken[1].connect(bob).approve(staking.target, hre.ethers.parseEther("4"))

            await ethers.provider.send('evm_mine', []); // 手动挖矿

            await BTC.mint(hre.ethers.parseEther("1000000"))
            await BTC.approve(staking.target, hre.ethers.parseEther("1000000"))

            const startTime = (await hre.ethers.provider.getBlock('latest')).timestamp + 60
            const durationSenconds = 60n * 60n * 3n
            await staking.addPool(BTC.target, startTime, durationSenconds,
                [pledgeToken[0].target, pledgeToken[1].target], [hre.ethers.parseEther("0.01"), hre.ethers.parseEther("0.001")], projectLeader)

            expect(await staking.getPoolsLength()).to.eq(1)
            expect(await BTC.balanceOf(deployer)).to.eq(hre.ethers.parseEther("1000000") - (hre.ethers.parseEther("0.01") + hre.ethers.parseEther("0.001")) * durationSenconds)
            expect(await BTC.balanceOf(staking.target)).to.eq((hre.ethers.parseEther("0.01") + hre.ethers.parseEther("0.001")) * durationSenconds)

            // 暂停自动挖矿
            await hre.network.provider.send("evm_setAutomine", [false]);
            await ethers.provider.send('evm_setNextBlockTimestamp', [startTime + 10]); // 30 seconds before endTimestamp
            await ethers.provider.send('evm_mine', []); // Mine a block to apply the new timestamp
            // 部署者存入每个均存入一个BTC
            await staking.deposit(0, 0, hre.ethers.parseEther("2"), { gasLimit: 1000000 })
            await staking.deposit(0, 1, hre.ethers.parseEther("2"), { gasLimit: 1000000 })
            await ethers.provider.send('evm_mine', []); // 手动挖矿

            // // // alice每个均存入一个BTC, 设置下一区块的时间是xx秒之后
            await ethers.provider.send('evm_setNextBlockTimestamp', [(await hre.ethers.provider.getBlock('latest')).timestamp + 60]); // 30 seconds before endTimestamp
            await staking.connect(alice).deposit(0, 0, hre.ethers.parseEther("4"), { gasLimit: 1000000 })
            await staking.connect(alice).deposit(0, 1, hre.ethers.parseEther("4"), { gasLimit: 1000000 })
            await ethers.provider.send('evm_mine', []); // 手动挖矿
            // // // bob 每个存入五个ETH, 设置下一区块的时间是xx秒之后
            await ethers.provider.send('evm_setNextBlockTimestamp', [(await hre.ethers.provider.getBlock('latest')).timestamp + 60]); // 30 seconds before endTimestamp

            await staking.connect(bob).deposit(0, 0, hre.ethers.parseEther("4"), { gasLimit: 1000000 })
            await staking.connect(bob).deposit(0, 1, hre.ethers.parseEther("4"), { gasLimit: 1000000 })
            await ethers.provider.send('evm_mine', []); // 手动挖矿

            // // 设置下一区块的时间戳
            await ethers.provider.send('evm_setNextBlockTimestamp', [(await hre.ethers.provider.getBlock('latest')).timestamp + 60]); // 30 seconds before endTimestamp
            await ethers.provider.send('evm_mine', []); // 手动挖矿
            await hre.network.provider.send("evm_setAutomine", [true]);// 恢复自动挖矿

            expect(await pledgeToken[0].balanceOf(staking.target)).to.eq(hre.ethers.parseEther("10"))
            expect(await pledgeToken[1].balanceOf(staking.target)).to.eq(hre.ethers.parseEther("10"))
            expect(await pledgeToken[0].balanceOf(deployer)).to.eq(0)
            expect(await pledgeToken[1].balanceOf(deployer)).to.eq(0)
            expect(await pledgeToken[0].connect(alice).balanceOf(deployer)).to.eq(0)
            expect(await pledgeToken[1].connect(alice).balanceOf(deployer)).to.eq(0)
            expect(await pledgeToken[0].connect(bob).balanceOf(deployer)).to.eq(0)
            expect(await pledgeToken[1].connect(bob).balanceOf(deployer)).to.eq(0)

            // 获取部署者当前的账户余额
            expect(await staking.getUserNotWithDrawRewards(0, 0)).to.eq(hre.ethers.parseEther("0.01") * (60n + 60n * 2n / 6n + 60n * 2n / 10n))
            expect(await staking.getUserNotWithDrawRewards(0, 1)).to.eq(hre.ethers.parseEther("0.001") * (60n + 60n * 2n / 6n + 60n * 2n / 10n))

            expect(await staking.connect(alice).getUserNotWithDrawRewards(0, 0)).to.eq(hre.ethers.parseEther("0.01") * (60n * 4n / 6n + 60n * 4n / 10n))
            expect(await staking.connect(alice).getUserNotWithDrawRewards(0, 1)).to.eq(hre.ethers.parseEther("0.001") * (60n * 4n / 6n + 60n * 4n / 10n))

            expect(await staking.connect(bob).getUserNotWithDrawRewards(0, 0)).to.eq(hre.ethers.parseEther("0.01") * 60n * 4n / 10n)
            expect(await staking.connect(bob).getUserNotWithDrawRewards(0, 1)).to.eq(hre.ethers.parseEther("0.001") * 60n * 4n / 10n)
        })

        it("Deposit coin and withraw and deposit", async () => {
            await pledgeToken[0].mint(hre.ethers.parseEther("2"))
            await pledgeToken[1].mint(hre.ethers.parseEther("2"))
            await pledgeToken[0].approve(staking.target, hre.ethers.parseEther("2"))
            await pledgeToken[1].approve(staking.target, hre.ethers.parseEther("2"))

            await pledgeToken[0].connect(alice).mint(hre.ethers.parseEther("4"))
            await pledgeToken[1].connect(alice).mint(hre.ethers.parseEther("4"))
            await pledgeToken[0].connect(alice).approve(staking.target, hre.ethers.parseEther("4"))
            await pledgeToken[1].connect(alice).approve(staking.target, hre.ethers.parseEther("4"))

            await pledgeToken[0].connect(bob).mint(hre.ethers.parseEther("4"))
            await pledgeToken[1].connect(bob).mint(hre.ethers.parseEther("4"))
            await pledgeToken[0].connect(bob).approve(staking.target, hre.ethers.parseEther("4"))
            await pledgeToken[1].connect(bob).approve(staking.target, hre.ethers.parseEther("4"))

            await ethers.provider.send('evm_mine', []); // 手动挖矿

            await BTC.mint(hre.ethers.parseEther("1000000"))
            await BTC.approve(staking.target, hre.ethers.parseEther("1000000"))

            const startTime = (await hre.ethers.provider.getBlock('latest')).timestamp + 60
            const durationSenconds = 60n * 60n * 3n
            await staking.addPool(BTC.target, startTime, durationSenconds,
                [pledgeToken[0].target, pledgeToken[1].target], [hre.ethers.parseEther("0.01"), hre.ethers.parseEther("0.001")], projectLeader)

            expect(await staking.getPoolsLength()).to.eq(1)
            expect(await BTC.balanceOf(deployer)).to.eq(hre.ethers.parseEther("1000000") - (hre.ethers.parseEther("0.01") + hre.ethers.parseEther("0.001")) * durationSenconds)
            expect(await BTC.balanceOf(staking.target)).to.eq((hre.ethers.parseEther("0.01") + hre.ethers.parseEther("0.001")) * durationSenconds)

            // 暂停自动挖矿
            await hre.network.provider.send("evm_setAutomine", [false]);
            await ethers.provider.send('evm_setNextBlockTimestamp', [startTime + 10]); // 30 seconds before endTimestamp
            await ethers.provider.send('evm_mine', []); // Mine a block to apply the new timestamp
            // 部署者存入每个均存入一个BTC
            await staking.deposit(0, 0, hre.ethers.parseEther("2"), { gasLimit: 1000000 })
            await staking.deposit(0, 1, hre.ethers.parseEther("2"), { gasLimit: 1000000 })
            await ethers.provider.send('evm_mine', []); // 手动挖矿

            // // // alice每个均存入一个BTC, 设置下一区块的时间是xx秒之后
            await ethers.provider.send('evm_setNextBlockTimestamp', [(await hre.ethers.provider.getBlock('latest')).timestamp + 60]); // 30 seconds before endTimestamp
            await staking.connect(alice).deposit(0, 0, hre.ethers.parseEther("4"), { gasLimit: 1000000 })
            await staking.connect(alice).deposit(0, 1, hre.ethers.parseEther("4"), { gasLimit: 1000000 })
            await ethers.provider.send('evm_mine', []); // 手动挖矿

            // // // bob 每个存入五个ETH, 设置下一区块的时间是xx秒之后
            await ethers.provider.send('evm_setNextBlockTimestamp', [(await hre.ethers.provider.getBlock('latest')).timestamp + 60]); // 30 seconds before endTimestamp
            await staking.connect(bob).deposit(0, 0, hre.ethers.parseEther("4"), { gasLimit: 1000000 })
            await staking.connect(bob).deposit(0, 1, hre.ethers.parseEther("4"), { gasLimit: 1000000 })
            await ethers.provider.send('evm_mine', []); // 手动挖矿

            await ethers.provider.send('evm_setNextBlockTimestamp', [(await hre.ethers.provider.getBlock('latest')).timestamp + 60]); // 30 seconds before endTimestamp
            await staking.connect(alice).withdrawPledge(0, 0, hre.ethers.parseEther("2"), { gasLimit: 1000000 })
            await staking.connect(alice).withdrawPledge(0, 1, hre.ethers.parseEther("2"), { gasLimit: 1000000 })
            await ethers.provider.send('evm_mine', []); // 手动挖矿

            await ethers.provider.send('evm_setNextBlockTimestamp', [(await hre.ethers.provider.getBlock('latest')).timestamp + 60]); // 30 seconds before endTimestamp
            await ethers.provider.send('evm_mine', []); // 手动挖矿
            await hre.network.provider.send("evm_setAutomine", [true]);// 恢复自动挖矿

            expect(await staking.getUserNotWithDrawRewards(0, 0)).to.eq(hre.ethers.parseEther("0.01") * (60n + 60n * 2n / 6n + 60n * 2n / 10n + 60n * 2n / 8n))
            expect(await staking.getUserNotWithDrawRewards(0, 1)).to.eq(hre.ethers.parseEther("0.001") * (60n + 60n * 2n / 6n + 60n * 2n / 10n + 60n * 2n / 8n))

            expect(await staking.connect(alice).getUserNotWithDrawRewards(0, 0)).to.eq(hre.ethers.parseEther("0.01") * (60n * 4n / 6n + 60n * 4n / 10n + 60n * 2n / 8n))
            expect(await staking.connect(alice).getUserNotWithDrawRewards(0, 1)).to.eq(hre.ethers.parseEther("0.001") * (60n * 4n / 6n + 60n * 4n / 10n + 60n * 2n / 8n))

            expect(await staking.connect(bob).getUserNotWithDrawRewards(0, 0)).to.eq(hre.ethers.parseEther("0.01") * (60n * 4n / 10n + 60n * 4n / 8n))
            expect(await staking.connect(bob).getUserNotWithDrawRewards(0, 1)).to.eq(hre.ethers.parseEther("0.001") * (60n * 4n / 10n + 60n * 4n / 8n))
        })
    })

    context("Deposit coin to staking", async () => {
        // it("Deposit coin and withraw and deposit", async () => {
        //     await pledgeToken[0].mint(hre.ethers.parseEther("2"))
        //     await pledgeToken[1].mint(hre.ethers.parseEther("2"))
        //     await pledgeToken[0].approve(staking.target, hre.ethers.parseEther("2"))
        //     await pledgeToken[1].approve(staking.target, hre.ethers.parseEther("2"))

        //     await pledgeToken[0].connect(alice).mint(hre.ethers.parseEther("4"))
        //     await pledgeToken[1].connect(alice).mint(hre.ethers.parseEther("4"))
        //     await pledgeToken[0].connect(alice).approve(staking.target, hre.ethers.parseEther("4"))
        //     await pledgeToken[1].connect(alice).approve(staking.target, hre.ethers.parseEther("4"))

        //     await pledgeToken[0].connect(bob).mint(hre.ethers.parseEther("4"))
        //     await pledgeToken[1].connect(bob).mint(hre.ethers.parseEther("4"))
        //     await pledgeToken[0].connect(bob).approve(staking.target, hre.ethers.parseEther("4"))
        //     await pledgeToken[1].connect(bob).approve(staking.target, hre.ethers.parseEther("4"))

        //     await ethers.provider.send('evm_mine', []); // 手动挖矿

        //     await BTC.mint(hre.ethers.parseEther("1000000"))
        //     await BTC.approve(staking.target, hre.ethers.parseEther("1000000"))

        //     const startTime = (await hre.ethers.provider.getBlock('latest')).timestamp + 60
        //     const durationSenconds = 60n * 60n * 3n
        //     await staking.addPool(BTC.target, startTime, durationSenconds,
        //         [pledgeToken[0].target, pledgeToken[1].target], [hre.ethers.parseEther("0.01"), hre.ethers.parseEther("0.001")], projectLeader)

        //     expect(await staking.getPoolsLength()).to.eq(1)
        //     expect(await BTC.balanceOf(deployer)).to.eq(hre.ethers.parseEther("1000000") - (hre.ethers.parseEther("0.01") + hre.ethers.parseEther("0.001")) * durationSenconds)
        //     expect(await BTC.balanceOf(staking.target)).to.eq((hre.ethers.parseEther("0.01") + hre.ethers.parseEther("0.001")) * durationSenconds)

        //     // 暂停自动挖矿
        //     await hre.network.provider.send("evm_setAutomine", [false]);
        //     await ethers.provider.send('evm_setNextBlockTimestamp', [startTime + 10]); // 30 seconds before endTimestamp
        //     await ethers.provider.send('evm_mine', []); // Mine a block to apply the new timestamp
        //     // 部署者存入每个均存入一个BTC
        //     await staking.deposit(0, 0, hre.ethers.parseEther("2"), { gasLimit: 1000000 })
        //     await staking.deposit(0, 1, hre.ethers.parseEther("2"), { gasLimit: 1000000 })
        //     await ethers.provider.send('evm_mine', []); // 手动挖矿

        //     // // // alice每个均存入一个BTC, 设置下一区块的时间是xx秒之后
        //     await ethers.provider.send('evm_setNextBlockTimestamp', [(await hre.ethers.provider.getBlock('latest')).timestamp + 60]); // 30 seconds before endTimestamp
        //     await staking.connect(alice).deposit(0, 0, hre.ethers.parseEther("4"), { gasLimit: 1000000 })
        //     await staking.connect(alice).deposit(0, 1, hre.ethers.parseEther("4"), { gasLimit: 1000000 })
        //     await ethers.provider.send('evm_mine', []); // 手动挖矿

        //     // // // bob 每个存入五个ETH, 设置下一区块的时间是xx秒之后
        //     await ethers.provider.send('evm_setNextBlockTimestamp', [(await hre.ethers.provider.getBlock('latest')).timestamp + 60]); // 30 seconds before endTimestamp
        //     await staking.connect(bob).deposit(0, 0, hre.ethers.parseEther("4"), { gasLimit: 1000000 })
        //     await staking.connect(bob).deposit(0, 1, hre.ethers.parseEther("4"), { gasLimit: 1000000 })
        //     await ethers.provider.send('evm_mine', []); // 手动挖矿

        //     // 设置当前下一个区块的时间为项目结束的时间
        //     await ethers.provider.send('evm_setNextBlockTimestamp', [BigInt(startTime) + durationSenconds + 60n]); // 30 seconds before endTimestamp
        //     await ethers.provider.send('evm_mine', []); // 手动挖矿

        //     await hre.network.provider.send("evm_setAutomine", [true]);// 恢复自动挖矿


        //     await staking.withdraw(0, 0)
        //     await staking.withdraw(0, 1)

        //     expect(await BTC.balanceOf(deployer)).to.eq(0n)
        // hre.ethers.parseEther("0.01") * (60n + 60n * 2n / 6n + 60n * 2n / 10n + (durationSenconds - 180n) * 2n / 8n )
        // expect().to.eq(hre.ethers.parseEther("0.001") * (60n + 60n * 2n / 6n + 60n * 2n / 10n + 60n * 2n / 8n))

        // expect(await staking.connect(alice).withdraw(0, 0)).to.eq(hre.ethers.parseEther("0.01") * (60n * 4n / 6n + 60n * 4n / 10n + 60n * 2n / 8n))
        // expect(await staking.connect(alice).withdraw(0, 0)).to.eq(hre.ethers.parseEther("0.001") * (60n * 4n / 6n + 60n * 4n / 10n + 60n * 2n / 8n))

        // expect(await staking.connect(bob).withdraw(0, 0)).to.eq(hre.ethers.parseEther("0.01") * (60n * 4n / 10n + 60n * 4n / 8n))
        // expect(await staking.connect(bob).withdraw(0, 1)).to.eq(hre.ethers.parseEther("0.001") * (60n * 4n / 10n + 60n * 4n / 8n))
        // })
        // contract Staking is Ownable {
        //     struct User {
        //         uint amount; // 质押的平台代币数量
        //         uint yield; // 收益
        //         uint theoreticalYield; // 按照每个share的收益量，理论上收益的数
        //         uint withDrawYield; // 已经提取走的收益
        //     }

        //     // 质押池
        //     struct Pool {
        //         address projectLeader; // 项目方地址
        //         IERC20 yieldToekn; // 收益的token
        //         uint[] totalLpSupply;
        //         uint startTime; // 开始时间
        //         uint endTime; // 结束时间
        //         uint[] perLpRewards; // 每个token的收益
        //         uint[] latestUpdateTimes; // 上次更新的时间
        //         IERC20[] pledgeToken; // 需要质押的token
        //         uint[] perSecondsRewards; // 每秒的收益
        //         uint[] noAllocatedRewards; // 没有分配的收益
        //     }
        //     // 取走获得的奖金
        //     function withdrawRewards(uint pid, uint tokenIndex, uint amount) public {
        //     }

    })
    context("", async () => {
        //     // 取出质押的代币
        //     function withdrawPledge(uint pid, uint tokenIndex, uint amount) public {
        //     }
    })
    context("", async () => {
        //     // 取走质押的金额和奖金
        //     function withdraw(uint pid, uint tokenIndex) external {
        //     }
    })
    context("", async () => {
        //     // 更新一个池中的所有奖金
        //     function uptePoolsRewards(uint pid) public {
        //     }
    })
    context("", async () => {
        //     // 更新奖励的金额
        //     function uptePoolRewards(uint pid, uint tokenIndex) public {
        //     }
    })
    context("", async () => {
        //     // 更新所有的池
        //     function updatePools() public {
        //     }
    })
    context("", async () => {
        //     // 项目方来取走没有分配的空投剩余代币
        //     function projectLeaderWithDraw(uint pid)  {
        //     }

    })
    context("", async () => {
        //     // 获取用户没有提取的奖励数量
        //     function getUserNotWithDrawRewards(
        //         uint pid,
        //         uint tokenIndex
        //     ) public view returns (uint) {
    })
})

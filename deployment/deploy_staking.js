const hre = require("hardhat")

async function main() {
    const Staking = await hre.ethers.getContractFactory("Staking")
    const staking = await Staking.deploy()
    console.log("deploy staking address: ", staking.target)
}


main().then(() => process.exit(0)).catch(
    error => {
        console.log(error)
        process.exit(-1)
    }
)
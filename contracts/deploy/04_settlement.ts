import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deployer } = await getNamedAccounts();

  const tbill = await deployments.get("ConfidentialTBill");
  const usdc = await deployments.get("ConfidentialUSDC");

  const result = await deployments.deploy("Settlement", {
    from: deployer,
    args: [tbill.address, usdc.address],
    log: true,
  });
  console.log(`Settlement deployed at ${result.address}`);

  // Wire the settler role on both token contracts. Idempotent — safe to re-run.
  const tbillContract = await ethers.getContractAt("ConfidentialTBill", tbill.address);
  const usdcContract = await ethers.getContractAt("ConfidentialUSDC", usdc.address);

  const currentTbillSettler: string = await tbillContract.settler();
  if (currentTbillSettler.toLowerCase() !== result.address.toLowerCase()) {
    const tx = await tbillContract.setSettler(result.address);
    await tx.wait();
    console.log(`cTBILL.setSettler(${result.address})`);
  }
  const currentUsdcSettler: string = await usdcContract.settler();
  if (currentUsdcSettler.toLowerCase() !== result.address.toLowerCase()) {
    const tx = await usdcContract.setSettler(result.address);
    await tx.wait();
    console.log(`cUSDC.setSettler(${result.address})`);
  }
};

func.tags = ["Settlement"];
func.id = "deploy_settlement";
func.dependencies = ["ConfidentialTBill", "ConfidentialUSDC"];
export default func;

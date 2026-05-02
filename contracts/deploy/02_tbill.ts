import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const result = await deployments.deploy("ConfidentialTBill", {
    from: deployer,
    args: [deployer],
    log: true,
  });
  console.log(`ConfidentialTBill deployed at ${result.address}`);
};

func.tags = ["ConfidentialTBill"];
func.id = "deploy_confidential_tbill";
export default func;

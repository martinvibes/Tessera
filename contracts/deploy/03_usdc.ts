import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const result = await deployments.deploy("ConfidentialUSDC", {
    from: deployer,
    args: [deployer],
    log: true,
  });
  console.log(`ConfidentialUSDC deployed at ${result.address}`);
};

func.tags = ["ConfidentialUSDC"];
func.id = "deploy_confidential_usdc";
export default func;

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const result = await deployments.deploy("TesseraID", {
    from: deployer,
    args: [deployer],
    log: true,
  });
  console.log(`TesseraID deployed at ${result.address}`);
};

func.tags = ["TesseraID"];
func.id = "deploy_tessera_id";
export default func;

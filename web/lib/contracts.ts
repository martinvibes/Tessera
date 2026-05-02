import TesseraIDArtifact from "@/lib/abi/TesseraID.json";
import TBillArtifact from "@/lib/abi/ConfidentialTBill.json";
import USDCArtifact from "@/lib/abi/ConfidentialUSDC.json";

export const ADDR = {
  tesseraId: process.env.NEXT_PUBLIC_TESSERA_ID_ADDRESS ?? "",
  tbill: process.env.NEXT_PUBLIC_TBILL_ADDRESS ?? "",
  usdc: process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "",
} as const;

export const TESSERA_ID_ABI = TesseraIDArtifact.abi;
export const TBILL_ABI = TBillArtifact.abi;
export const USDC_ABI = USDCArtifact.abi;

import "dotenv/config";
import { parseEmailConfig } from "../modules/email/email-config.js";
export const emailConfig = parseEmailConfig(process.env);

export { QuotaLedger } from "./quota/QuotaLedger.js";
import { WorkerApplication } from "./http/WorkerApplication.js";
import type { Env } from "./Types.js";

const application = new WorkerApplication();

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return application.fetch(request, env);
  },
};

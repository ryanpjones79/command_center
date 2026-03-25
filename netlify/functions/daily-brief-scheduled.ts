import { runDailyBriefAutosend } from "../../server/daily-brief-autosend";

export const config = {
  schedule: "*/15 * * * *"
};

export default async () => {
  const result = await runDailyBriefAutosend(new Date());

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: {
      "content-type": "application/json"
    }
  });
};

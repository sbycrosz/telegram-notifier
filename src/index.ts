import { addDays, format, startOfDay } from "date-fns";

import axios from "axios";
import { dirname } from "path";
import fs from "fs";
import { toZonedTime } from "date-fns-tz";

const STATE_FILE = ".cache/state.json";
const TIMEZONE = "Asia/Singapore";

function getEnv(name: string) {
  const env = process.env[name];
  if (!env) throw new Error(`${name} is not defined in environment`);
  return env;
}

const BASE_API_URL = getEnv("BASE_API_URL");
const TELEGRAM_BOT_TOKEN = getEnv("TELEGRAM_BOT_TOKEN");
const TELEGRAM_CHAT_ID = getEnv("TELEGRAM_CHAT_ID");
const TELEGRAM_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

async function run() {
  try {
    const currentTime = toZonedTime(new Date(), TIMEZONE);
    const startTime = startOfDay(addDays(currentTime, 1)).getTime();
    const endTime = addDays(new Date(startTime), 30).getTime();

    const fullUrl = `${BASE_API_URL}?startTime=${startTime}&endTime=${endTime}`;
    const { data } = await axios.get(fullUrl);

    let slots = (data.slots || []) as { startAt: number; endAt: number }[];
    slots = slots.sort((a, b) => a.startAt - b.startAt);

    const currentSlots = slots.map((s) => {
      const zonedDate = toZonedTime(new Date(s.startAt), TIMEZONE);
      return {
        formatted: format(zonedDate, "EEEE, MMM d, yyyy 'at' h:mm b"),
      };
    });

    let previousSlots = [];
    if (fs.existsSync(STATE_FILE)) {
      previousSlots = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    }

    const currentHash = JSON.stringify(currentSlots);
    const previousHash = JSON.stringify(previousSlots);

    if (currentHash === previousHash) {
      console.log("No changes since last check.");
      return;
    }

    console.log("Change detected. Preparing notification...");

    const message =
      `🔔 **Slot Update Detected**\n\n` +
      currentSlots.map((s) => `• ${s.formatted}`).join("\n");
    await axios.post(TELEGRAM_URL, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "Markdown",
    });
    console.log("Notification sent.");

    console.log("Updating cache");
    fs.mkdirSync(dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(currentSlots, null, 2));
  } catch (error) {
    console.error("Workflow failed:", error);
    process.exit(1);
  }
}

run();

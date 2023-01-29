import noblox from "noblox.js";
import axios from "axios";
import { createServer } from "http";

const { post } = axios;
const { setCookie, getGroup, getRole, setRank } = noblox;

process.on("uncaughtException", console.error);

try {
    (await import("dotenv")).config();
} catch (e) {
    if (process.env.NODE_ENV !== "production") {
        console.warn("Failed to environment variables from dotenv. This isn't an issue if they are loaded in from elsewhere.");
        console.warn(e);
    }
}

await setCookie(process.env.COOKIE);

console.log("logged in!")

const GROUP_ID = parseInt(process.env.GROUP_ID);
const { name: groupName } = await getGroup(GROUP_ID);
const promoteRole = await getRole(GROUP_ID, parseInt(process.env.ROLE_RANK));

async function sendToWebhook(content) {
    // 1900 is content length max (2000 is but 100 char buffer)
    return content.match(/[\s\S]{1,1900}(?![^\n])/gm).map(s => s.trim()).reduce(
        (promise, content) => promise.then(() => post(process.env.WEBHOOK_URL, { content })), 
        Promise.resolve()
    );
}

const RETRIES = 5;
const RETRY_TIMEOUT_MS = 30000;

async function set(userId, userName, relog) {

    let content;

    try {
        let success = false;
        for (let i = 0; i < RETRIES; i++) {
            try {
                console.log(`Attempting to promote ${userName} to **${promoteRole.name}** in **${groupName}**`);
                await Promise.race([
                    setRank(process.env.GROUP_ID, userId, promoteRole),
                    new Promise((_, reject) => {
                        setTimeout(reject, RETRY_TIMEOUT_MS, "REQUEST_TIMEOUT");
                    })
                ]);

                success = true;
                
                break;
            } catch (e) {
                if (e != "REQUEST_TIMEOUT") {
                    throw e
                }

                if (relog) {
                    console.log(`Request timed out for promoting ${userName} to **${promoteRole.name}** in **${groupName}** so relogging`);
                    await setCookie(process.env.COOKIE)
                    console.log("logged in!")
                    await set(userId, userName, false)
                    return
                }
            }
        }

        content = success 
            ? `Successfully promoted ${userName} to **${promoteRole.name}** in **${groupName}**`
            : content = `Failed to promote ${userName} to **${promoteRole.name}** in **${groupName}**\n\`\`\`MAX REQUEST TIMEOUT RETRIES (${RETRIES}) REACHED\`\`\``;
    } catch (e) {
        content = `Failed to promote ${userName} to **${promoteRole.name}** in **${groupName}**\n\`\`\`${e.message}\`\`\``;
    }

    console.log(content);

    try {
        const res = await sendToWebhook(content);
        console.log(`statusCode: ${res.status}`);
    } catch(e) {
        console.error(e);
    }
}

createServer(function (req, res) {
    console.log(`${req.method} request received!`);
    if (req.method !== "POST") return;

    let body = "";

    req.on("data", data => body += data.toString());
    req.on("end", async () => {
        body = JSON.parse(body);
        if (body.pass === process.env.PASSWORD) {
            let userId = parseInt(body.userId);
            if (!isNaN(userId) && userId > 0 && body.username && body.report) {
                console.log(`Processing @${body.username} (${userId}) for application ${body.passed ? "success" : "failure"}`);
                try {
                    await sendToWebhook(body.report);
                } catch (e) {
                    console.error(e);
                }

                res.writeHead(200);
                res.end();

                if (body.passed) {
                    try {
                        await set(userId, body.username, true);
                    } catch (e) {
                        console.error(e);
                    }
                }
            } else {
                res.writeHead(400);
            }
        } else {
            res.writeHead(401);
        }
        res.end();
    });
}).listen(process.env.PORT || 8080);
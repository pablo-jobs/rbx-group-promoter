import noblox from "noblox.js";
import axios from "axios";
import { createServer } from "http";

const { post } = axios;
const { setCookie, getGroup, getRole, setRank } = noblox;

const MAX_MESSAGE_CONTENT_LENGTH = 1900;

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

const GROUP_ID = parseInt(process.env.GROUP_ID);
const { name: groupName } = await getGroup(GROUP_ID);
const promoteRole = await getRole(GROUP_ID, parseInt(process.env.ROLE_RANK));

async function sendToWebhook(content) {
    if (content.length <= MAX_MESSAGE_CONTENT_LENGTH) {
        return post(process.env.WEBHOOK_URL, { content });
    } else {
        let payload = [];
        let payloadCharLength = 0;
        let lines = content.split("\n");
        let request = Promise.resolve();
        
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            if (payloadCharLength + payload.length + line.length > MAX_MESSAGE_CONTENT_LENGTH) {
                if (payload.length) {
                    const c = payload.join("\n");
                    request = request.then(() => post(process.env.WEBHOOK_URL, { content: c }));
                    payload = [];
                    payloadCharLength = 0;
                } else {
                    lines.splice(i, 1, line.substring(0, MAX_MESSAGE_CONTENT_LENGTH), line.substring(MAX_MESSAGE_CONTENT_LENGTH, line.length));
                }
            } else {
                payload.push(line);
                payloadCharLength += line.length;
                i++;
            }
        }

        if (payload.length) {
            request = request.then(() => post(process.env.WEBHOOK_URL, { content: payload.join("\n") }));
        }

        return request;
    }
}

async function set(userId, userName) {

    let content;

    try {
        await setRank(process.env.GROUP_ID, userId, promoteRole);
        content = `Successfully promoted ${userName} to **${promoteRole.name}** in **${groupName}**`;
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
                try {
                    await sendToWebhook(body.report).finally(() => body.passed && set(userId, body.username));
                    res.writeHead(200);
                } catch (e) {
                    console.error(e);
                    res.writeHead(500);
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
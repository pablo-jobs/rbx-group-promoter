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

const GROUP_ID = parseInt(process.env.GROUP_ID);

await setCookie(process.env.COOKIE);

const { name: groupName } = await getGroup(GROUP_ID);
const promoteRole = await getRole(GROUP_ID, parseInt(process.env.ROLE_RANK));

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
        const res = await post(process.env.WEBHOOK_URL, { content });
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
            if (!isNaN(userId) && userId > 0 && body.username) {
                await set(userId, body.username);
                res.writeHead(200);
            } else {
                res.writeHead(400);
            }
        } else {
            res.writeHead(401);
        }
        res.end();
    });
}).listen(process.env.PORT || 8080);
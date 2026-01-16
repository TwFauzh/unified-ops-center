const axios = require("axios");

function normalizePanelUrl(panelUrl) {
  return String(panelUrl || "").trim().replace(/\/+$/, "");
}

function pteroClient(token, panelUrl) {
  const baseUrl = normalizePanelUrl(panelUrl);
  if (!baseUrl) throw new Error("缺少 Pterodactyl 面板網址");
  if (!token) throw new Error("缺少 Pterodactyl Client API 金鑰");

  return axios.create({
    baseURL: `${baseUrl}/api/client`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

async function getServerResources(serverId, token, panelUrl) {
  const api = pteroClient(token, panelUrl);
  const res = await api.get(`/servers/${serverId}/resources`);
  return res.data;
}

async function sendCommand(serverId, command, token, panelUrl) {
  const api = pteroClient(token, panelUrl);
  const res = await api.post(`/servers/${serverId}/command`, { command });
  return res.data;
}

async function setPower(serverId, signal, token, panelUrl) {
  const api = pteroClient(token, panelUrl);
  const res = await api.post(`/servers/${serverId}/power`, { signal });
  return res.data;
}

async function getAccount(token, panelUrl) {
  const api = pteroClient(token, panelUrl);
  const res = await api.get(`/account`);
  return res.data;
}

module.exports = { getServerResources, sendCommand, setPower, getAccount };

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/orig/apps/desktop/electron/media-protocol.ts
var media_protocol_exports = {};
__export(media_protocol_exports, {
  MEDIA_PROTOCOL: () => MEDIA_PROTOCOL,
  createMediaProtocolHandler: () => createMediaProtocolHandler,
  isStreamableMediaPath: () => isStreamableMediaPath,
  mediaRequestHeaders: () => mediaRequestHeaders,
  remoteMediaEndpoint: () => remoteMediaEndpoint
});
module.exports = __toCommonJS(media_protocol_exports);
var STREAMABLE_MEDIA_EXTENSIONS = [
  ".avi",
  ".flac",
  ".m4a",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".ogg",
  ".opus",
  ".wav",
  ".webm"
];
var FORWARDED_MEDIA_REQUEST_HEADERS = ["accept", "if-modified-since", "if-none-match", "if-range", "range"];
var MEDIA_PROTOCOL = "hermes-media";
function parseMediaProtocolTarget(rawUrl) {
  const url = new URL(rawUrl);
  const mode = url.hostname;
  if (mode !== "remote" && mode !== "stream") {
    throw new Error("Unsupported media protocol target");
  }
  const filePath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!filePath) {
    throw new Error("Missing media path");
  }
  const profile = url.searchParams.get("profile")?.trim() || void 0;
  return { filePath, mode, profile };
}
function isStreamableMediaPath(filePath) {
  const lower = filePath.toLowerCase();
  return STREAMABLE_MEDIA_EXTENSIONS.some((extension) => lower.endsWith(extension));
}
function mediaRequestHeaders(source) {
  const forwarded = new Headers();
  for (const name of FORWARDED_MEDIA_REQUEST_HEADERS) {
    const value = source.get(name);
    if (value) {
      forwarded.set(name, value);
    }
  }
  return forwarded;
}
function remoteMediaEndpoint(baseUrl, filePath) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const url = new URL(`${normalizedBase}/api/files/stream`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported Hermes backend URL protocol: ${url.protocol}`);
  }
  url.searchParams.set("path", filePath);
  return url.toString();
}
function createMediaProtocolHandler(dependencies) {
  return async (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        headers: { allow: "GET, HEAD" },
        status: 405
      });
    }
    const method = request.method;
    let target;
    try {
      target = parseMediaProtocolTarget(request.url);
    } catch {
      return new Response("Media not found", { status: 404 });
    }
    if (!isStreamableMediaPath(target.filePath)) {
      return new Response("Unsupported media type", { status: 415 });
    }
    const headers = mediaRequestHeaders(request.headers);
    if (target.mode === "stream") {
      try {
        const resolvedPath = await dependencies.resolveLocalFile(target.filePath);
        if (!isStreamableMediaPath(resolvedPath)) {
          return new Response("Unsupported media type", { status: 415 });
        }
        return await dependencies.fetchLocal(resolvedPath, headers, method);
      } catch {
        return new Response("Media not found", { status: 404 });
      }
    }
    try {
      const connection = await dependencies.resolveRemoteConnection(target.profile);
      if (connection.mode !== "remote") {
        return new Response("Remote media backend unavailable", { status: 404 });
      }
      const endpoint = remoteMediaEndpoint(connection.baseUrl, target.filePath);
      if (connection.authMode === "oauth") {
        const bearer = await dependencies.ensureRemoteBearer(connection.baseUrl);
        if (bearer) {
          headers.set("authorization", `Bearer ${bearer}`);
          return await dependencies.fetchRemote(endpoint, headers, method);
        }
        return await dependencies.fetchRemoteWithCookies(endpoint, headers, method);
      }
      if (!connection.token) {
        return new Response("Remote media authentication unavailable", { status: 401 });
      }
      headers.set("x-hermes-session-token", connection.token);
      return await dependencies.fetchRemote(endpoint, headers, method);
    } catch {
      return new Response("Remote media unavailable", { status: 502 });
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MEDIA_PROTOCOL,
  createMediaProtocolHandler,
  isStreamableMediaPath,
  mediaRequestHeaders,
  remoteMediaEndpoint
});

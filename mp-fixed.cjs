var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/fixed/apps/desktop/electron/media-protocol.ts
var media_protocol_exports = {};
__export(media_protocol_exports, {
  MEDIA_PROTOCOL: () => MEDIA_PROTOCOL,
  REMOTE_MEDIA_CHUNK_BYTES: () => REMOTE_MEDIA_CHUNK_BYTES,
  createMediaProtocolHandler: () => createMediaProtocolHandler,
  isStreamableMediaPath: () => isStreamableMediaPath,
  mediaRequestHeaders: () => mediaRequestHeaders,
  remoteMediaEndpoint: () => remoteMediaEndpoint
});
module.exports = __toCommonJS(media_protocol_exports);

// src/fixed/apps/desktop/electron/api-transport.ts
var import_node_http = __toESM(require("node:http"));
var import_node_https = __toESM(require("node:https"));
var HTTP_JSON_AGENT = new import_node_http.default.Agent({ keepAlive: true, maxSockets: 50 });
var HTTPS_JSON_AGENT = new import_node_https.default.Agent({ keepAlive: true, maxSockets: 50 });
var HTTP_DOWNLOAD_AGENT = new import_node_http.default.Agent({ keepAlive: true, maxSockets: 8 });
var HTTPS_DOWNLOAD_AGENT = new import_node_https.default.Agent({ keepAlive: true, maxSockets: 8 });
function httpStatusError(statusCode, text, statusMessage) {
  const status = Number.isInteger(statusCode) && statusCode > 0 ? statusCode : 500;
  const detail = String(text || statusMessage || "");
  const error = new Error(`${status}: ${detail}`);
  error.statusCode = status;
  return error;
}
function readStatusCode(error) {
  return Number(error && typeof error === "object" ? error.statusCode : NaN);
}

// src/fixed/apps/desktop/electron/oauth-rest-request.ts
var import_node_async_hooks = require("node:async_hooks");

// src/fixed/apps/desktop/electron/connection-config.ts
function isGatewayAuthRejection(error) {
  if (error && typeof error === "object" && error.needsOauthLogin === true) {
    return true;
  }
  const statusCode = readStatusCode(error);
  return statusCode === 401 || statusCode === 403;
}

// src/fixed/apps/desktop/electron/native-access-token.ts
var NativeAuthChangedError = class extends Error {
  constructor() {
    super("Authentication changed while the request was in progress. Try again.");
  }
};

// src/fixed/apps/desktop/electron/oauth-rest-request.ts
async function cookieFallback(request, nativeError) {
  if (nativeError instanceof NativeAuthChangedError) {
    throw nativeError;
  }
  try {
    return await request();
  } catch (cookieError) {
    if (isGatewayAuthRejection(cookieError)) {
      throw nativeError;
    }
    throw cookieError;
  }
}
async function requestWithOauthFallback(baseUrl, deps) {
  let nativeAccessToken;
  try {
    nativeAccessToken = await deps.ensureNativeAccessToken(baseUrl);
  } catch (error) {
    return cookieFallback(deps.requestWithCookie, error);
  }
  return nativeAccessToken ? deps.requestWithBearer(nativeAccessToken) : deps.requestWithCookie();
}
var interactiveLoginAllowed = new import_node_async_hooks.AsyncLocalStorage();

// src/fixed/apps/desktop/electron/media-protocol.ts
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
var REMOTE_MEDIA_CHUNK_BYTES = 2 * 1024 * 1024;
var OPEN_OR_CLOSED_RANGE = /^bytes=(\d+)-(\d*)$/;
var CONTENT_RANGE = /^bytes (\d+)-(\d+)\/(\d+)$/;
async function remoteMediaInChunks(requestedRange, fetchRange) {
  const requested = OPEN_OR_CLOSED_RANGE.exec((requestedRange ?? "bytes=0-").trim());
  if (!requested) {
    return fetchRange(requestedRange ?? "");
  }
  const start = Number(requested[1]);
  const askedEnd = requested[2] === "" ? Infinity : Number(requested[2]);
  const nextRange = (from, last) => `bytes=${from}-${Math.min(last, from + REMOTE_MEDIA_CHUNK_BYTES - 1)}`;
  const first = await fetchRange(nextRange(start, askedEnd));
  const served = CONTENT_RANGE.exec(first.headers.get("content-range") ?? "");
  if (first.status !== 206 || !served) {
    return first;
  }
  const size = Number(served[3]);
  const end = Math.min(askedEnd, size - 1);
  const head = new Uint8Array(await first.arrayBuffer());
  let next = Number(served[2]) + 1;
  const headers = new Headers(first.headers);
  headers.set("content-range", `bytes ${start}-${end}/${size}`);
  headers.set("content-length", String(end - start + 1));
  if (next > end) {
    return new Response(head, { headers, status: 206 });
  }
  const body = new ReadableStream(
    {
      start(controller) {
        controller.enqueue(head);
      },
      async pull(controller) {
        const response = await fetchRange(nextRange(next, end));
        const chunk = CONTENT_RANGE.exec(response.headers.get("content-range") ?? "");
        if (response.status !== 206 || !chunk || Number(chunk[1]) !== next) {
          await response.body?.cancel();
          throw new Error("Remote media range unavailable");
        }
        controller.enqueue(new Uint8Array(await response.arrayBuffer()));
        next = Number(chunk[2]) + 1;
        if (next > end) {
          controller.close();
        }
      }
    },
    { highWaterMark: 0 }
  );
  return new Response(body, { headers, status: 206 });
}
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
  const connectionId = url.searchParams.get("connectionId")?.trim() || void 0;
  const profile = url.searchParams.get("profile")?.trim() || void 0;
  return { connectionId, filePath, mode, profile };
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
function remoteMediaEndpoint(baseUrl, filePath, profile) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const url = new URL(`${normalizedBase}/api/files/stream`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported Hermes backend URL protocol: ${url.protocol}`);
  }
  url.searchParams.set("path", filePath);
  if (profile) {
    url.searchParams.set("profile", profile);
  }
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
      const connection = await dependencies.resolveRemoteConnection({
        connectionId: target.connectionId,
        profile: target.profile
      });
      if (connection.mode !== "remote") {
        return new Response("Remote media backend unavailable", { status: 404 });
      }
      const endpoint = remoteMediaEndpoint(
        connection.baseUrl,
        target.filePath,
        connection.sharedRemote ? target.profile : void 0
      );
      for (const [name, value] of Object.entries(connection.headers ?? {})) {
        if (!headers.has(name)) {
          headers.set(name, value);
        }
      }
      const { token } = connection;
      if (connection.authMode !== "oauth" && !token) {
        return new Response("Remote media authentication unavailable", { status: 401 });
      }
      const fetchUpstream = () => {
        if (connection.authMode !== "oauth") {
          headers.set("x-hermes-session-token", token);
          return dependencies.fetchRemote(endpoint, headers, method);
        }
        return requestWithOauthFallback(connection.baseUrl, {
          ensureNativeAccessToken: dependencies.ensureRemoteBearer,
          requestWithBearer: (bearer) => {
            headers.set("authorization", `Bearer ${bearer}`);
            return dependencies.fetchRemote(endpoint, headers, method);
          },
          requestWithCookie: async () => {
            const response = await dependencies.fetchRemoteWithCookies(endpoint, headers, method);
            if (response.status === 401 || response.status === 403) {
              await response.body?.cancel();
              throw httpStatusError(response.status, "Remote media authentication unavailable");
            }
            return response;
          }
        });
      };
      if (method === "HEAD") {
        return await fetchUpstream();
      }
      return await remoteMediaInChunks(headers.get("range"), (range) => {
        headers.set("range", range);
        return fetchUpstream();
      });
    } catch (error) {
      const status = readStatusCode(error);
      return new Response("Remote media unavailable", { status: status === 401 || status === 403 ? status : 502 });
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MEDIA_PROTOCOL,
  REMOTE_MEDIA_CHUNK_BYTES,
  createMediaProtocolHandler,
  isStreamableMediaPath,
  mediaRequestHeaders,
  remoteMediaEndpoint
});

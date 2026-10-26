/**
 * dsh-mari-skin — Host 半边
 *
 * 只做两件事，且全部 fail-open（任何一步失败都不影响 DSH 原界面）：
 *
 *   1. 静态资源路由：把 assets/ 挂到 /mari-skin/*，供 skin.css 的背景图使用。
 *   2. index 注入：把 skin.css 作为一条 <style> 行放进 index.html 的 <head>，
 *      走 webserver/index-inject —— 官方为插件准备的注入通道。
 *
 * ── 为什么样式放 Host 侧 ────────────────────────────────────────────────────
 * 背景图需要一条真实 HTTP 路由；index-inject 只往 <head> 追加一个 <style>，
 * 不碰 React 树、不注册插槽、不产生任何可见 UI 节点。
 * （唯一在运行时新建的元素是开机动画的临时 <video>，由 lib/client.js 负责，
 *  挂在 <html> 直接子级、播完即移除；本文件不创建任何元素。）
 *
 * ── 关于 ?noskin=1 ──────────────────────────────────────────────────────────
 * webserver/index-inject 的签名是 (table)，且 renderIndex() 不接受请求对象，
 * 所以 Host 侧拿不到「本次导航的 URL」，无法按页跳过注入。
 * 因此 ?noskin=1 由 Client 半边（lib/client.js）在浏览器里完成：
 * 它不设置 data-dsh-skin，并移除可能已存在的同名属性。
 * 皮肤的所有规则都挂在 html[data-dsh-skin="mari"] 之下，属性一没，
 * 样式立即整体失效 —— 等价于「临时关闭皮肤」，且不需要刷新插件。
 *
 * ── 为什么 apply 不抛错 ────────────────────────────────────────────────────
 * apply() 同步抛错会让 fiber 失败，整个 profile 报 "failed to load plugins"。
 * 所以每一步都自己兜住异常，最坏情况只是「没有皮肤」。
 */
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join, normalize, sep } from "node:path";

const PACKAGE_ID = "dsh-mari-skin";

/** 背景图路由前缀，必须与 skin.css 里的 url("/mari-skin/bg.jpg") 一致。 */
const ASSET_PREFIX = "/mari-skin";
const ASSET_DIR = fileURLToPath(new URL("../assets/", import.meta.url));
const SKIN_CSS = fileURLToPath(new URL("../skin.css", import.meta.url));

/** 只列本皮肤真正会发的类型。 */
const MIME = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	// 开机动画：webm 优先（体积约为原始 mp4 的 1/50）
	".webm": "video/webm",
	".mp4": "video/mp4",
	// 字幕 / 封面（可选）
	".vtt": "text/vtt",
};

/**
 * 把请求路径解析成 assets/ 内的真实文件。
 * 拒绝目录穿越、绝对路径与非文件。
 * @param pathname 例如 /mari-skin/bg.jpg
 * @returns 绝对文件路径；不属于本皮肤或不存在时返回 undefined
 */
function resolveAsset(pathname) {
	if (!pathname.startsWith(`${ASSET_PREFIX}/`)) return undefined;
	let rel;
	try {
		rel = decodeURIComponent(pathname.slice(ASSET_PREFIX.length + 1));
	} catch {
		return undefined; // 非法的百分号转义
	}
	if (rel === "" || rel.includes("\0")) return undefined;
	const full = normalize(join(ASSET_DIR, rel));
	const root = ASSET_DIR.endsWith(sep) ? ASSET_DIR : ASSET_DIR + sep;
	if (!full.startsWith(root)) return undefined;
	try {
		if (!statSync(full).isFile()) return undefined;
	} catch {
		return undefined;
	}
	return full;
}

/**
 * 读取 skin.css，包装成一条可注入的 style 行。
 *
 * 皮肤整体挂在 html[data-dsh-skin="mari"] 之下（属性由 lib/client.js 设置）。
 * 于是：Client 没跑起来 = 样式虽在页面里但全部不匹配 = 界面保持官方原样。
 *
 * @returns {object|undefined} 注入行；skin.css 不可读时返回 undefined
 */
function styleRow() {
	let css;
	try {
		css = readFileSync(SKIN_CSS, "utf8");
	} catch {
		return undefined;
	}
	// <style> 的文本里出现 </style 会提前闭合元素，转义掉以保证结构不被破坏。
	return {
		kind: "style",
		text: `/* ${PACKAGE_ID} — injected via webserver/index-inject */\n${css.replace(/<\/style/gi, "<\\/style")}`,
	};
}

/**
 * 注册静态资源路由。路由随插件卸载自动摘除（ctx.effect）。
 * @param ctx host cordis context（已由 inject 保证 webServer 存在）
 */
function mountAssets(ctx) {
	ctx.effect(() =>
		ctx.webServer.register({
			kind: "prefix",
			path: ASSET_PREFIX,
			handler: (req, res) => {
				try {
					const url = new URL(req.url ?? "/", "http://localhost");
					const file = resolveAsset(url.pathname);
					if (file === undefined) {
						res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
						res.end("not found");
						return;
					}
					const type = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
					const body = readFileSync(file);
					const total = body.byteLength;

					// ── Range 支持（★新增）──────────────────────────────────
					// <video> 在 Chromium 里会先发 `Range: bytes=0-` 探测，
					// 并且播放中可能分段请求。只回 200 全量也能播，
					// 但某些情况下会导致 Safari / 移动端拒绝播放或无法 seek。
					// 这里实现标准的 206 单区间响应。
					const range = req.headers?.range;
					if (typeof range === "string") {
						const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
						if (m !== null) {
							let start;
							let end;
							if (m[1] === "" && m[2] === "") {
								// "bytes=-" 无意义，当作全量
								start = 0;
								end = total - 1;
							} else if (m[1] === "") {
								// 后缀区间：最后 N 字节
								const suffix = Number(m[2]);
								start = Math.max(0, total - suffix);
								end = total - 1;
							} else {
								start = Number(m[1]);
								end = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1);
							}
							if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
								res.writeHead(416, { "content-range": `bytes */${total}` });
								res.end();
								return;
							}
							const chunk = body.subarray(start, end + 1);
							res.writeHead(206, {
								"content-type": type,
								"content-length": String(chunk.byteLength),
								"content-range": `bytes ${start}-${end}/${total}`,
								"accept-ranges": "bytes",
								"cache-control": "public, max-age=31536000, immutable",
							});
							res.end(chunk);
							return;
						}
					}

					res.writeHead(200, {
						"content-type": type,
						"content-length": String(total),
						"accept-ranges": "bytes",
						// 皮肤资源随包发布，可以长缓存
						"cache-control": "public, max-age=31536000, immutable",
					});
					res.end(body);
				} catch (error) {
					// 单个请求失败绝不能让 webServer 崩掉
					try {
						res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
						res.end("skin asset error");
					} catch {
						/* 响应已不可写 */
					}
					try {
						ctx.logger?.warn?.(`[${PACKAGE_ID}] asset failed: ${String(error)}`);
					} catch {
						/* ignore */
					}
				}
			},
		}),
		`${PACKAGE_ID}: asset route`,
	);
}

/**
 * 订阅 index 注入表，把 skin.css 塞进 <head>。
 * @param ctx host cordis context
 */
function mountIndexInjection(ctx) {
	ctx.on(
		"webserver/index-inject",
		(table) => {
			try {
				const row = styleRow();
				// skin.css 读不到 = 不注入，界面保持官方原样
				if (row === undefined || !Array.isArray(table)) return;
				table.push(row);
			} catch (error) {
				try {
					ctx.logger?.warn?.(`[${PACKAGE_ID}] index injection failed: ${String(error)}`);
				} catch {
					/* ignore */
				}
			}
		},
		{ prepend: true },
	);
}

/**
 * Host 入口。
 *
 * 声明 inject = ["webServer"]：没有 Web 服务端（headless / acp profile）时本插件
 * 保持未激活，而不是抛错；Web profile 下 webServer 一定存在。
 *
 * @param ctx host cordis context
 */
export function apply(ctx) {
	try {
		mountAssets(ctx);
	} catch (error) {
		try {
			ctx.logger?.warn?.(`[${PACKAGE_ID}] asset route failed: ${String(error)}`);
		} catch {
			/* ignore */
		}
	}

	try {
		mountIndexInjection(ctx);
	} catch (error) {
		try {
			ctx.logger?.warn?.(`[${PACKAGE_ID}] index injection unavailable: ${String(error)}`);
		} catch {
			/* ignore */
		}
	}
}

/** 依赖的 Host 服务：仅 Web 端存在。 */
export const inject = ["webServer"];

export default { apply, name: PACKAGE_ID, inject };

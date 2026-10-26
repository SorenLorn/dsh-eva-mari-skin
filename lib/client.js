/**
 * dsh-mari-skin — Client 半边
 *
 * 三件事，全部以「不破坏 DSH」为前提：
 *
 *   1. 皮肤作用域：给 <html> 打 data-dsh-skin="mari"
 *      所有皮肤样式都挂在 html[data-dsh-skin="mari"] 下，属性不在 = 零生效。
 *
 *   2. 开机动画：首次加载时全屏播放 /mari-skin/boot.webm，
 *      播完（ended）立刻撤掉 video，露出底下已渲染好的 DSH 界面。
 *      视频最后一帧 = assets/bg.jpg，所以撤掉时画面是「同一张图」，
 *      肉眼无缝。任何失败（404 / 解码失败 / 超时）都直接跳过。
 *
 *   3. 顺序入场：视频结束后才给 <html> 打 data-dsh-skin-go="1"，
 *      skin.css 里标题栏 → 顶部导航 → 侧边栏 → 主区 → 输入框
 *      依次错开淡入上浮。
 *
 * ── 边界说明：只加属性 + 一个临时 video ──────────────────────────────────
 * 全屏视频需要一个真实的 <video>，这是本插件**唯一**创建的元素，且它
 * **只存在于 <html> 直接子级、播放期间**：播完（或任何失败）先淡出再 remove，
 * 不进入 DSH 的 React 树，不占插槽，不影响任何事件冒泡（pointer-events:none），
 * 也不进无障碍树（aria-hidden + tabindex=-1）。
 * 除此之外，一切都只靠给 <html> 加 data-* 属性驱动 CSS，不改 DSH 的 DOM 结构。
 *
 * ── ★ 侧栏折叠状态镜像（2026-10 新增，backdrop 修复的前提）──────────────
 * 遮罩是 ::backdrop 伪元素，它的宿主是 <html>。而 DSH 把折叠状态写在
 * **frame 元素**上（frame[data-sidebar-collapsed]），<html> 上并没有。
 *
 * 要用规格要求的 html[data-sidebar-collapsed="true"]::backdrop 控制遮罩，
 * 就必须把那个状态「镜像」到 <html> 上。做法：只读监听 frame 的属性变化，
 * 把值同步成 "true" / 移除，**不写回、不改 DSH 的 DOM**。
 *   · 只增加一个 data-* 属性，零结构改动；
 *   · 用 MutationObserver 只观察 attributes，开销极低；
 *   · 大小写/布尔/空串统一归一为 "true" 或移除，保证 CSS 选择器能命中。
 *
 * ── 只播一次是怎么保证的 ─────────────────────────────────────────────────
 * 三道锁，任何一道成立就不再播：
 *   a) <html data-dsh-skin-booted="1"> —— 同一文档内已播过
 *   b) sessionStorage["dsh-mari-skin:booted"] —— 刷新后仍在（同一标签页）
 *   c) document.visibilityState === "hidden" 时不启动
 * 切换会话 / 新建对话不会重新加载文档，因此天然不会重播。
 *
 * 想强制再看一次：URL 加 ?boot=1，或清掉 sessionStorage。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ 转码指南：把 3.mp4 转成高清 VP9 WebM（画质↑ 帧率↑ 体积↓）★★★
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ★★★ 必须使用 1440P / 60fps / VP9 的 webm ★★★                            │
 * │                                                                         │
 * │   绝对不要把原始 59MB 的 3.mp4 直接塞进 assets/。                       │
 * │   它会把首屏拖到十几秒，并且 4K60 H.264 在低端机上必然掉帧。             │
 * │                                                                         │
 * │   正确的产物是 assets/boot.webm：                                        │
 * │       2560 × 1440 · 60fps · VP9 · CRF 26 · 约 3.6MB                     │
 * │                                                                         │
 * │   验证命令：                                                            │
 * │     ffprobe -v error -select_streams v:0 \                             │
 * │       -show_entries stream=codec_name,width,height,r_frame_rate \      │
 * │       -of default=nw=1 assets/boot.webm                                 │
 * │   期望输出：codec_name=vp9 / width=2560 / height=1440                   │
 * │            r_frame_rate=60/1                                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * 为什么必须转：原始 3.mp4 是 3840×2160 / 60fps / 68.8Mbps / **59MB**。
 *   · 59MB 直接塞进插件，首屏要下十几秒，还会被判超时；
 *   · H.264 在 4K60 下解码压力大，低端机直接掉帧 → 观感「卡」；
 *   · 浏览器的 H.264 解码器在 yuv420p 高位深时还会走软件路径。
 * VP9 + WebM 在 Chromium/Edge 里是硬件解码优先，且同画质下体积小 30~50%。
 *
 * ── 推荐：1440p / 60fps / CRF 26（约 3.6MB，当前采用，清晰度接近原片）──────
 *   ffmpeg -y -i 3.mp4 -an \
 *     -vf "scale=2560:1440:flags=lanczos,fps=60" \
 *     -c:v libvpx-vp9 -b:v 0 -crf 26 -row-mt 1 -threads 8 -cpu-used 2 \
 *     -pix_fmt yuv420p \
 *     assets/boot.webm
 *
 * ── 更小体积：1440p / 60fps / CRF 30（约 3.0MB，画质略降）────────────────
 *   把上面命令的 -crf 26 改成 -crf 30 即可。
 *
 * ── 低配/小体积版：1080p / 60fps / CRF 30（约 1.5MB）─────────────────────
 *   ffmpeg -y -i 3.mp4 -an \
 *     -vf "scale=1920:1080:flags=lanczos,fps=60" \
 *     -c:v libvpx-vp9 -b:v 0 -crf 30 -row-mt 1 -threads 8 -cpu-used 2 \
 *     -pix_fmt yuv420p \
 *     assets/boot.webm
 *
 * ── 极限清晰版：2160p / 60fps / CRF 32（约 8~12MB，不建议默认）───────────
 *   ffmpeg -y -i 3.mp4 -an \
 *     -vf "scale=3840:2160:flags=lanczos,fps=60" \
 *     -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 -threads 8 -cpu-used 1 \
 *     -pix_fmt yuv420p \
 *     assets/boot.webm
 *
 * ── 关键参数说明 ─────────────────────────────────────────────────────────
 *   -an                  去掉音轨（开机动画静音，省体积也避免自动播放被拦）
 *   scale=...:flags=lanczos   高质量 Lanczos 重采样，比默认 bicubic 锐利得多
 *   fps=60               保留 60fps；从 60 降到 30 会明显「顿」
 *   -crf 26              VP9 恒定质量。数值越小越清晰、体积越大；
 *                        26≈近无损，30≈高画质但略软，34 开始明显糊
 *   -b:v 0               必须配合 crf，表示「纯恒定质量模式」
 *   -row-mt 1            多线程行级并行，编码快 2~4 倍（不影响画质）
 *   -cpu-used 2          0=最慢最好，5=最快最差。2 是画质/耗时平衡点
 *   -pix_fmt yuv420p     最广兼容；yuv420p10le 更高位深但部分设备不支持
 *
 * ── 转完自检（可选）──────────────────────────────────────────────────────
 *   ffprobe -v error -select_streams v:0 \
 *     -show_entries stream=width,height,r_frame_rate,codec_name \
 *     -of default=nw=1 assets/boot.webm
 *   期望：codec_name=vp9 / width=2560 / height=1440 / r_frame_rate=60/1
 *
 * ── 体积 / 画质对照（同一源片实测，2026-10 更新）──────────────────────────
 *   原始 3.mp4  (H.264 4K60 69Mbps)   59.0 MB   ← 禁止直接发布
 *   1440p60 CRF26 VP9（当前采用）     ~3.6 MB   ← 清晰度 41.8（源片 42.0）
 *   1440p60 CRF30 VP9                 ~3.0 MB   ← 清晰度 41.6
 *   1080p60  CRF30 VP9                ~1.5 MB   ← 低配回退
 *   1080p30  CRF36 VP9（旧版）        ~1.2 MB   ← 模糊/掉帧的元凶，已弃用
 *
 *   清晰度用「拉普拉斯方差」衡量（越大越锐，同一帧对比）：
 *     源片 4K60 = 42.0 | 1440p60 CRF26 = 41.8 | 1440p60 CRF30 = 41.6
 *     旧版 1080p30 CRF36 = 40.5  ← 糊的主因是分辨率减半 + 帧率减半
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ── 画质 / 帧率优化（代码侧，已实测校正）─────────────────────────────────
 * 真正起作用的是下面 3 条；按重要性排序：
 *   1. ★ 视频源分辨率 —— 决定性因素。旧版 1080p30 在 2K/4K 屏上被放大必糊。
 *         现版 2560×1440@60，像素量 1.78 倍、帧率翻倍。这是画质提升的主因。
 *   2. ★ 不给 <video> 写 width/height 内联尺寸，也不加 transform:scale()。
 *         否则会「先按小尺寸解码再拉伸」或「合成器二次采样」，必糊。
 *         尺寸完全交给 CSS 的 100% + object-fit:cover（由合成器直接裁剪）。
 *   3. preload="auto" + poster=bg.jpg：视频没到时先显示 bg.jpg
 *         （= 视频末帧），绝不会黑屏或白闪。
 *
 * ⚠ 需要澄清的一点（避免误导）：
 *   CSS 的 image-rendering 只作用于 <img> / canvas / background-image，
 *   **对 <video> 不生效**（Chromium 实测 computed style 恒为 auto）。
 *   skin.css §8.1 里仍写了它，一是让「视频兜底背景」受益（那是
 *   background-image，确实生效），二是前向兼容；
 *   但它**不是**清晰度提升的原因，别指望靠它修糊。
 * ═══════════════════════════════════════════════════════════════════════════
 */

window.__ModuleLoader__.load({
	id: "dsh-mari-skin",
	factory: function (require) {
		var module = { exports: {} };
		var exports = module.exports;

		var PACKAGE_ID = "dsh-mari-skin";

		/* --- 属性名（与 skin.css 一一对应） --- */
		var ATTR = "data-dsh-skin"; // 皮肤作用域
		var GO_ATTR = "data-dsh-skin-go"; // 顺序入场起跑枪
		var BOOT_ATTR = "data-dsh-skin-boot"; // 开机视频期间（= 冻结入场）
		var ARMED_ATTR = "data-dsh-skin-armed"; // ★新增：入场待命（元素已藏成动画起始态）
		var BOOTED_ATTR = "data-dsh-skin-booted"; // 本会话已播过
		var VALUE = "mari";

		/* --- 原生标题条底色（最小化 / 最大化 / 关闭 那一条）-------------------
		 * ★ 2026-10 第三轮改版：**不再隐藏按钮**，改为「让标题条底色跟着画面走」。
		 *     开场（黑视频）→ 标题条纯黑 + 浅色符号，与视频无缝；
		 *     交接（转粉色背景）→ 320ms 内逐帧混到皮肤粉 + 主题符号色。
		 * CAPTION_ATTR 只是「由 JS 接管」的开关，值不参与 CSS 选择器。
		 * 真正生效的是 skin.css §8.6 ②：它把 preload 探针的 background-color /
		 * color 接到下面两个自定义属性上 —— 所以这里写的必须是**最终**
		 * rgb()/rgba() 字面量（原生侧只接受最终色，不认识 color-mix）。
		 */
		var CAPTION_ATTR = "data-dsh-skin-caption";
		var CAPTION_BG_VAR = "--mari-caption-bg-step";
		var CAPTION_SYM_VAR = "--mari-caption-sym-step";
		/* 开场态（= §1 的 --mari-caption-boot / --mari-caption-symbol-boot） */
		var CAPTION_BOOT_BG = [0, 0, 0];
		var CAPTION_BOOT_BG_A = 1;
		var CAPTION_BOOT_SYM = [255, 255, 255];
		var CAPTION_BOOT_SYM_A = 0.92;
		/* 终态：必须与 §1 / §4 的 --mari-caption-fill、--dsw-alias-label-primary
		   同值。原生侧读不到 CSS 变量，只能各写一份 —— 改一处记得同步另一处。 */
		var CAPTION_END_LIGHT = { bg: [249, 180, 205], bgA: 0.94, sym: [58, 16, 36], symA: 1 };
		var CAPTION_END_DARK = { bg: [26, 10, 18], bgA: 0.94, sym: [255, 232, 241], symA: 1 };
		var CAPTION_FUSE_MS = 20000; // 保险丝：> 视频最长播放(16s)+退场，兜底必回粉
		/* 触发 preload 重新取色的「探针变量」：写一下立刻删掉，
		   只为在 body 上制造一次 style 属性变动（preload 只监听这个）。 */
		var CAPTION_TICK_VAR = "--dsh-mari-caption-tick";

		/* --- 侧栏折叠状态 / 遮罩控制（供 ::backdrop 修复使用） --- */
		var COLLAPSED_ATTR = "data-sidebar-collapsed"; // DSH 写在 frame 上，我们镜像到 <html>
		var COLLAPSED_MIRROR = "data-dsh-sidebar-collapsed"; // 可选：镜像副本，便于调试观察

		/* 遮罩控制变量（与 skin.css §12.1 一一对应，改名必须两边同步） */
		var BD_OPACITY_VAR = "--mari-backdrop-opacity";
		var BD_EVENTS_VAR = "--mari-backdrop-pointer-events";

		/* --- 右侧栏折叠：状态属性由官方写在 frame 上 ---
		 * 皮肤不再用 JS 监听，纯粹由 skin.css §14 的属性选择器处理：
		 *     :root[data-rightbar-collapsed] [data-sidebar-right-panel] { ... }
		 * 这里只保留属性名，供需要时查询（例如调试），不做任何监听。
		 */
		var RIGHTBAR_ATTR = "data-rightbar-collapsed";

		/* --- 资源（由 Host 侧 lib/index.js 的 /mari-skin 路由提供） --- */
		var ASSET_BASE = "/mari-skin";
		var VIDEO_CANDIDATES = [
			// 优先 webm（体积小 50 倍），回退 mp4 —— 顺序即优先级
			ASSET_BASE + "/boot.webm",
			ASSET_BASE + "/boot.mp4",
		];
		var POSTER_URL = ASSET_BASE + "/bg.jpg";

		/* --- 时控（毫秒） --- */
		var FUSE_MS = 8000; // 总保险丝：最迟放行
		var VIDEO_LOAD_TIMEOUT = 4000; // 视频元数据迟迟不来就跳过
		var VIDEO_MAX_MS = 16000; // 视频最长播放时间（防止卡在某帧）
		var POST_VIDEO_SETTLE = 120; // 视频撤掉后等一帧再起跑，避免撕裂

		/* ★ 2026-10 二次优化：退场过渡参数
		   VIDEO_FADE_MS 必须与 skin.css 的 --mari-boot-fade 保持一致（320ms）。
		   JS 侧读不到 CSS 变量，只能两边各写一份 —— 改一处时记得同步。
		   VIDEO_HOLD_MS 必须与 skin.css 的 --mari-boot-hold 一致（120ms）：
		   帧冻结后先在 opacity:1 上「空转」一帧，让合成器把 overlay 平面
		   切换成普通合成层，再开始淡出 —— 否则切换那一帧会闪。
		   FADE_SAFETY_MS 是淡出的保险丝：即使 transitionend 事件没来，
		   也一定会在此时后强制移除，绝不让 video 永久留在页面上。 */
		var VIDEO_FADE_MS = 320;
		var VIDEO_HOLD_MS = 120;
		var FADE_SAFETY_MS = VIDEO_HOLD_MS + VIDEO_FADE_MS + 200;

		/* ★ 入场动画总时长：必须 ≥ skin.css §8.3 的最后一档
		   （400ms 延迟 + 560ms 时长 = 960ms）。armed 在这之后再摘，
		   保证动画播完才恢复官方默认态，摘除时零视觉变化。 */
		var ENTER_TOTAL_MS = 960;
		var ARMED_RELEASE_MS = ENTER_TOTAL_MS + 120;

		var STORAGE_KEY = "dsh-mari-skin:booted";

		var state = {
			video: null,
			goFired: false,
			bootStarted: false,
			disposed: false,
			fuseTimer: 0,
			loadTimer: 0,
			maxTimer: 0,
			settleTimer: 0,
			// ★ 新增：退场过渡
			fadeTimer: 0,
			fadeSafetyTimer: 0,
			fading: false,
			// ★ 新增：交接 / 待命
			handoffTimer: 0,
			armedTimer: 0,
			armed: false,
			// ★ 新增：原生标题条底色接管
			captionDriving: false,
			captionHandoff: false,
			captionFuseTimer: 0,
			captionTick: 0,
			// 遮罩控制相关
			backdropSheetReady: false,
			backdropSheet: null,
			backdropStyleEl: null,
		};

		/* ------------------------------------------------------------------ */
		/* 工具：全部自带 try/catch，绝不把异常抛给 DSH 加载器                */
		/* ------------------------------------------------------------------ */

		function html() {
			try {
				return typeof document !== "undefined" ? document.documentElement : null;
			} catch (e) {
				return null;
			}
		}

		function setAttr(name, value) {
			try {
				var doc = html();
				if (doc) doc.setAttribute(name, value);
			} catch (e) {
				/* ignore */
			}
		}

		function removeAttr(name) {
			try {
				var doc = html();
				if (doc) doc.removeAttribute(name);
			} catch (e) {
				/* ignore */
			}
		}

		function hasAttr(name) {
			try {
				var doc = html();
				return !!doc && doc.hasAttribute(name);
			} catch (e) {
				return false;
			}
		}

		function query(name) {
			try {
				return new URLSearchParams(location.search).get(name);
			} catch (e) {
				return null;
			}
		}

		function prefersReducedMotion() {
			try {
				return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			} catch (e) {
				return false;
			}
		}

		/** ?noskin=1 临时关闭皮肤。 */
		function skinDisabled() {
			var v = query("noskin");
			if (v === null) return false;
			v = String(v).trim().toLowerCase();
			return v === "" || v === "1" || v === "true" || v === "yes" || v === "on";
		}

		function warn(msg) {
			try {
				console.warn("[" + PACKAGE_ID + "] " + msg);
			} catch (e) {
				/* ignore */
			}
		}

		/* ------------------------------------------------------------------ */
		/* 只播一次的判定                                                      */
		/* ------------------------------------------------------------------ */

		function alreadyBooted() {
			// 强制重播
			if (query("boot") === "1") return false;
			// a) 同文档内已播
			if (hasAttr(BOOTED_ATTR)) return true;
			// b) 同标签页已播（刷新也不重播）
			try {
				if (window.sessionStorage && sessionStorage.getItem(STORAGE_KEY) === "1") return true;
			} catch (e) {
				/* 隐私模式 / 禁用存储：退化为仅同文档判定 */
			}
			return false;
		}

		function markBooted() {
			setAttr(BOOTED_ATTR, "1");
			try {
				if (window.sessionStorage) sessionStorage.setItem(STORAGE_KEY, "1");
			} catch (e) {
				/* ignore */
			}
		}

		/* ------------------------------------------------------------------ */
		/* 起跑枪：开始顺序入场                                                */
		/* ------------------------------------------------------------------ */

		/**
		 * ★ 2026-10 重写：起跑 + 待命态释放。
		 *
		 * ── 只在「真的 armed 过」时才打 go ──────────────────────────────────
		 * 这是本版最关键的一条约束，防止非首次加载时整屏闪一下：
		 *
		 *   alreadyBooted() / prefersReducedMotion() / ?noboot=1 这三条路径
		 *   不会创建 video，也就**不会 armed**，元素保持官方可见态（opacity:1）。
		 *   如果这时照样打 go，入场动画会以 fill-mode:both 的反向填充
		 *   把元素瞬间压到 opacity:0，再淡回来 —— 就是「先闪没再长回来」。
		 *
		 *   所以：armed 是入场动画的**前置条件**。没 armed = 没有起点态
		 *   = 不打 go = 元素一直是官方原样。CSS 侧也因此只需依赖 go
		 *   （因为 go 出现就必然意味着 armed 曾经出现过）。
		 *
		 * ── 顺序 ────────────────────────────────────────────────────────────
		 *   1. 摘 [data-dsh-skin-boot] —— 解除 §8.1 的「冻结入场」规则；
		 *   2. 打 [data-dsh-skin-go]   —— 入场动画从此刻起算；
		 *      ★ 两步必须相邻且同步执行，中间不能有异步间隙。
		 *   3. armed 保留到动画播完（scheduleArmedRelease）。
		 *      armed 提供起点态，go 的动画在层叠上压过它，两者共存无冲突。
		 */
		function fireGo() {
			if (state.disposed || state.goFired) return;
			state.goFired = true;
			clearTimers();
			removeAttr(BOOT_ATTR); // ① 解除冻结

			// ② 只有进入过待命态才起跑动画；否则保持官方原样（零闪）
			if (state.armed) {
				setAttr(GO_ATTR, "1");
				scheduleArmedRelease(); // ③ 动画播完后摘 armed
			}

			// ④ 原生标题条：颜色过渡有自己的时序（startCaptionHandoff 与视频淡出
			//    同起同落），这里只在「根本没有开机视频」时补一次重采 ——
			//    那正是第二次打开时按钮色差的解法：皮肤作用域早就打上了，
			//    但没人通知过 preload。
			if (!state.captionDriving) nudgeCaptionColorsLater();
		}

		/**
		 * ★ 入场待命：把入场元素预先藏成动画起始态。
		 *
		 * 调用时机：video 已成功挂载并铺满全屏之后（用户此时看不到底下）。
		 * 目的：让「隐藏 → 淡入」的隐藏那一步发生在视频还盖着的时候，
		 *       彻底消除「背景图稳定后 UI 先闪没再长回来」的跳变。
		 *
		 * 安全前提（缺一不可）：
		 *   · 只有 state.video 真的存在且已进入 DOM 才 armed；
		 *   · 没有 video（创建失败 / ?noboot / 已播过）一律不 armed。
		 *
		 * @returns {boolean} 是否成功进入待命态
		 */
		function armEnter() {
			if (state.disposed || state.armed || state.goFired) return false;
			var v = state.video;
			if (!v || !v.parentNode) return false;
			state.armed = true;
			setAttr(ARMED_ATTR, "1");
			return true;
		}

		/** 摘掉待命态，元素回到官方默认可见态（动画的 to 与默认态一致，零跳变）。 */
		function disarmEnter() {
			if (state.armedTimer) {
				try {
					clearTimeout(state.armedTimer);
				} catch (e) {
					/* ignore */
				}
				state.armedTimer = 0;
			}
			state.armed = false;
			removeAttr(ARMED_ATTR);
		}

		/**
		 * 动画播完再摘 armed。
		 *
		 * 为什么要等：armed 提供了动画的「起始态」，如果动画还在跑就摘掉，
		 * 元素会在中途回到 opacity:1 → 正在淡入的组件突然全亮，就是「跳变」。
		 * 960ms（§8.3 最后一档的 400ms 延迟 + 560ms 时长）之后动画已全部
		 * 结束在 to 态，此时摘 armed 与不摘在视觉上完全一致。
		 *
		 * 用 setTimeout 而不是 animationend：每个组件的 animationend 时间
		 * 不同，而且动画可能因为元素被 React 重建而根本不触发；
		 * 固定时长 + 兜底最可靠。标签页隐藏时 setTimeout 会被节流，
		 * 但那正好：用户看不到，晚点摘也无所谓。
		 */
		function scheduleArmedRelease() {
			if (!state.armed) return;
			try {
				if (state.armedTimer) clearTimeout(state.armedTimer);
				state.armedTimer = setTimeout(disarmEnter, ARMED_RELEASE_MS);
			} catch (e) {
				disarmEnter();
			}
		}

		/* ------------------------------------------------------------------ */
		/* 开机 video 的清理                                                   */
		/* ------------------------------------------------------------------ */

		/**
		 * 立即销毁 video（不淡出）。
		 * 用于：卸载、?noskin=1、以及淡出结束后的最终清理。
		 */
		function disposeVideo() {
			var v = state.video;
			state.video = null;
			if (!v) return;
			try {
				// 先解绑，避免 pause()/remove 再次触发 ended/error
				v.onended = null;
				v.onerror = null;
				v.onloadeddata = null;
				v.oncanplay = null;
				v.ontransitionend = null;
				v.pause();
			} catch (e) {
				/* ignore */
			}
			try {
				if (v.parentNode) v.parentNode.removeChild(v);
			} catch (e) {
				/* ignore */
			}
			try {
				// 释放解码器与缓冲，别把几十 MB 的内存留在后台
				v.removeAttribute("src");
				v.load();
			} catch (e) {
				/* ignore */
			}
		}

		function clearTimers() {
			var keys = [
				"fuseTimer",
				"loadTimer",
				"maxTimer",
				"settleTimer",
				"fadeTimer",
				"fadeSafetyTimer",
				"handoffTimer",
			];
			for (var i = 0; i < keys.length; i++) {
				var t = state[keys[i]];
				if (t) {
					try {
						clearTimeout(t);
					} catch (e) {
						/* ignore */
					}
					state[keys[i]] = 0;
				}
			}
			/* ★ 注意：不清 armedTimer —— 它是「入场动画播完后摘 armed」的定时器，
			   和开机阶段的那些保险丝语义不同。fireGo() 会调用 clearTimers()，
			   如果这里把它清掉，armed 就永远摘不掉了（元素会一直停在动画起点态）。
			   它的生命周期由 disarmEnter() / release() 负责。 */
		}

		/**
		 * ★ 2026-10 二次优化：视频退场改为「三段式」无缝交接。
		 *
		 * ── 为什么不能直接 removeChild ──────────────────────────────────────
		 * 直接移除会让浏览器在「视频最后一帧」与「body 背景图」之间
		 * 空出 1~2 帧（合成器要重新提交图层）→ 肉眼看到一次闪黑/闪跳。
		 *
		 * ── 为什么不能「直接从 overlay 淡出」────────────────────────────────
		 * 播放期 video 走硬件 overlay 直通（为了清晰度，见 skin.css §8.1）。
		 * overlay 平面**不支持 opacity** —— 一旦给它加过渡，
		 * Chromium 必须先把平面撤回、转成普通合成层，
		 * 这个切换发生在淡出的第 1 帧 → 屏幕闪一下（有时是黑，有时是白，
		 * 取决于底下的图层是否已提交）。这正是「闪白/跳变」的来源。
		 *
		 * ── 现在的三段式 ────────────────────────────────────────────────────
		 *   [1] 冻结      ended / error / timeout → 立刻 pause()，画面停在末帧。
		 *                此时末帧 = bg.jpg（同一张图），画面是静止的。
		 *   [2] 交接层    addClass("is-handoff")，opacity 保持 1，等 VIDEO_HOLD_MS。
		 *                这一步把 overlay 平面切换成普通合成层。
		 *                因为画面静止且与底下同图，切换本身不可见。
		 *   [3] 淡出      addClass("is-fading")，opacity 1→0，用 ease-out 曲线。
		 *                末帧与 bg.jpg 是同一张图，两层叠加几乎看不出变化，
		 *                淡出完成后 remove，露出底下的 bg.jpg。
		 *   最后再等 POST_VIDEO_SETTLE 一帧，才打 data-dsh-skin-go 起跑入场。
		 *
		 * ★ 期间不放行入场动画：避免「视频还在淡出、UI 已经开始动」的错乱感。
		 * ★ 入场元素在 video 挂上时就已 armed（藏成动画起始态），
		 *   所以淡出期间露出的只有 bg.jpg，不会看到 UI 先闪没。
		 *
		 * @param {string} reason 触发来源（日志用）
		 */
		function finishBoot(reason) {
			if (state.disposed) return;

			// 已经在退场流程里：只保证最终会被清理，不重复触发
			if (state.fading) {
				scheduleFinalCleanup();
				return;
			}

			// 入场已经起跑过：直接销毁，不必再走淡出
			if (state.goFired) {
				disposeVideo();
				return;
			}

			var v = state.video;
			if (!v || !v.parentNode) {
				// 没有 video 可淡出（创建失败 / 已被移除）：直接进入入场
				disposeVideo();
				clearTimers();
				markBooted();
				disarmEnter(); // 没有 video = 元素从未 armed；保险起见清一次
				// ★ 没有视频就没有淡出：标题条要立刻回粉，否则会一直黑着
				finishCaption();
				scheduleGo();
				return;
			}

			state.fading = true;
			clearTimers();
			markBooted();

			// 解绑播放事件，防止交接期间又被 ended/error 打断
			try {
				v.onended = null;
				v.onerror = null;
				v.onloadeddata = null;
				v.oncanplay = null;
			} catch (e) {
				/* ignore */
			}

			// 确保停在末帧（ended 后本身就是停住的，这里对 error/timeout 路径兜底）
			try {
				if (!v.paused) v.pause();
			} catch (e) {
				/* ignore */
			}

			// ── [2] 交接层 → [3] 淡出 ──
			var finished = false;

			function onFadeDone() {
				if (finished) return;
				finished = true;
				try {
					if (v) v.ontransitionend = null;
				} catch (e) {
					/* ignore */
				}
				// 淡出结束：真正移除，然后起跑入场
				disposeVideo();
				scheduleGo();
			}

			/** 开始真正的透明度过渡（此时合成层已就位）。 */
			function startFade() {
				if (finished) return;
				try {
					// 优先用 transitionend（精确）：只认 opacity 那一条
					v.ontransitionend = function (ev) {
						if (ev && ev.propertyName && ev.propertyName !== "opacity") return;
						onFadeDone();
					};
					v.classList.add("is-fading");
				} catch (e) {
					onFadeDone();
					return;
				}

				// ★ 原生标题条：与视频淡出**同一帧**开始由黑走到粉。
				//   早一帧 → 还没褪干净的黑画面上透出粉块；
				//   晚一帧 → 粉色背景上留一条黑边。两者都很难看，所以钉在这里。
				startCaptionHandoff();

				// 保险丝：transitionend 可能因为标签页隐藏、节流而不触发
				try {
					state.fadeSafetyTimer = setTimeout(onFadeDone, VIDEO_FADE_MS + 200);
				} catch (e) {
					onFadeDone();
				}
			}

			try {
				// 先挂交接层（opacity 仍为 1），让合成器把 overlay 撤回并提交一帧
				v.classList.add("is-handoff");
			} catch (e) {
				startFade();
				return;
			}

			// 空转 VIDEO_HOLD_MS：等合成器提交新图层后再开始淡出
			try {
				state.handoffTimer = setTimeout(startFade, VIDEO_HOLD_MS);
			} catch (e) {
				startFade();
			}

			warn("boot video handoff (" + reason + ")");
		}

		/** 淡出已在进行、又收到新的结束请求时：只保证最终清理。 */
		function scheduleFinalCleanup() {
			try {
				if (state.fadeSafetyTimer) clearTimeout(state.fadeSafetyTimer);
				state.fadeSafetyTimer = setTimeout(function () {
					disposeVideo();
					scheduleGo();
				}, FADE_SAFETY_MS);
			} catch (e) {
				disposeVideo();
				scheduleGo();
			}
		}

		/** 视频层已撤干净 → 等一帧让合成器提交 → 再起跑 UI 入场。 */
		function scheduleGo() {
			try {
				state.settleTimer = setTimeout(fireGo, POST_VIDEO_SETTLE);
			} catch (e) {
				fireGo();
			}
		}

		/* ------------------------------------------------------------------ */
		/* 原生窗口按钮（最小化 / 最大化 / 关闭）                              */
		/* ------------------------------------------------------------------ */

		/**
		 * 逼 DSH 的 preload 重新采集一次标题栏配色。
		 *
		 * ── 为什么需要「戳一下」──────────────────────────────────────────────
		 * 这三个按钮是 Windows 画的（Electron WCO），不在 DOM 里，CSS 选不中。
		 * 它们的配色由 preload（app.asar → lib/preload-app.cjs 的
		 * syncWindowsAppearance）读取 body 里一个隐藏探针的 computed style，
		 * 再通过 IPC 交给主进程 setTitleBarOverlay() 重绘。
		 *
		 * 但 preload **只在**这三种变动时重发：
		 *   · html[lang]
		 *   · body 的 data-ds-dark-theme 或 style 属性
		 *   · <head> 的 childList / 子树 / characterData
		 * 「html 上多了个 data-dsh-skin」并不在其中。
		 *
		 * 于是就有了「按钮色差」：preload 首次采样发生在皮肤作用域打上之前，
		 * 读到的是**官方**配色；之后皮肤把 --dsw-specific-sidebar-fill /
		 * --dsw-alias-label-primary 全改了，探针的 computed 值早已是对的，
		 * 但没有任何被监听的变动 → 按钮永远停在官方色上，跟皮肤背景不协调。
		 *
		 * 修法：在 body 上写一个自定义属性再立刻删掉，制造一次 style 变动。
		 * 这一下同时解决两件事：
		 *   · 皮肤就绪后重采 → 按钮换成皮肤配色（修色差）；
		 *   · §8.6 的探针改色生效 → 开场期间按钮消失 / 结束后重新出现。
		 * preload 侧自带去重（值没变就不发 IPC），多点几次也无害。
		 *
		 * ★ 全程只碰 body.style 上一个临时变量，不新增节点、不改别人的样式。
		 */
		function nudgeCaptionColors() {
			try {
				var b = document.body;
				if (!b || !b.style) return false;
				state.captionTick = (state.captionTick || 0) + 1;
				b.style.setProperty(CAPTION_TICK_VAR, String(state.captionTick));
				b.style.removeProperty(CAPTION_TICK_VAR);
				return true;
			} catch (e) {
				return false;
			}
		}

		/** 同上，但 body 还没建好时挂在 DOMContentLoaded 上补一次（幂等）。 */
		function nudgeCaptionColorsLater() {
			if (nudgeCaptionColors()) return;
			try {
				if (document.readyState === "loading") {
					document.addEventListener("DOMContentLoaded", function () {
						nudgeCaptionColors();
					}, { once: true });
					return;
				}
			} catch (e) {
				/* ignore */
			}
			// readyState 已过、body 却仍拿不到：等一拍再试一次
			try {
				setTimeout(nudgeCaptionColors, 0);
			} catch (e) {
				/* ignore */
			}
		}

		/**
		 * 把「第 t 帧」的标题条颜色写进 body 的两个自定义属性。
		 *
		 * t=0 → 纯黑 + 浅色符号（开场，压在黑视频上等于不存在）
		 * t=1 → 皮肤粉 + 主题符号色（交接完成）
		 *
		 * ★ 为什么自己插值而不用 CSS color-mix：
		 *   preload 用 canvas 读最终色再发 IPC，中间档必须是**能直接解析的
		 *   rgb()/rgba() 字面量**；color-mix 的计算值会变成 color(srgb …)，
		 *   万一 canvas 不认就会静默沿用上一帧的颜色（比不做还糟）。
		 * ★ 为什么写在 body.style 上：
		 *   preload 的 MutationObserver 正好监听 body 的 style 属性，
		 *   一次 setProperty 就等于「改色 + 通知重采」两件事，不需要额外 nudge。
		 */
		function writeCaptionColor(t) {
			var b = document.body;
			if (!b || !b.style) return false;
			if (t < 0) t = 0;
			if (t > 1) t = 1;

			var dark = false;
			try {
				dark = b.hasAttribute("data-ds-dark-theme");
			} catch (e) {
				/* ignore */
			}
			var end = dark ? CAPTION_END_DARK : CAPTION_END_LIGHT;

			var bg = [
				CAPTION_BOOT_BG[0] + (end.bg[0] - CAPTION_BOOT_BG[0]) * t,
				CAPTION_BOOT_BG[1] + (end.bg[1] - CAPTION_BOOT_BG[1]) * t,
				CAPTION_BOOT_BG[2] + (end.bg[2] - CAPTION_BOOT_BG[2]) * t,
			];
			var bgA = CAPTION_BOOT_BG_A + (end.bgA - CAPTION_BOOT_BG_A) * t;
			var sym = [
				CAPTION_BOOT_SYM[0] + (end.sym[0] - CAPTION_BOOT_SYM[0]) * t,
				CAPTION_BOOT_SYM[1] + (end.sym[1] - CAPTION_BOOT_SYM[1]) * t,
				CAPTION_BOOT_SYM[2] + (end.sym[2] - CAPTION_BOOT_SYM[2]) * t,
			];
			var symA = CAPTION_BOOT_SYM_A + (end.symA - CAPTION_BOOT_SYM_A) * t;

			try {
				b.style.setProperty(CAPTION_BG_VAR, captionRgba(bg, bgA));
				b.style.setProperty(CAPTION_SYM_VAR, captionRgba(sym, symA));
			} catch (e) {
				return false;
			}
			return true;
		}

		/** 拼 rgba() 字面量（三位小数足够，避免每帧字符串抖动）。 */
		function captionRgba(c, a) {
			var r = Math.round(c[0]);
			var g = Math.round(c[1]);
			var bl = Math.round(c[2]);
			var al = Math.round(a * 1000) / 1000;
			return "rgba(" + r + ", " + g + ", " + bl + ", " + al + ")";
		}

		/**
		 * 进入「JS 接管标题条」状态：开场纯黑。
		 *
		 * 顺序很重要：**先打属性、再写颜色**。
		 *   · 属性变化 preload 不监听（它只看 html[lang]），所以不会重采；
		 *   · 紧接着的 body.style 写入才会触发重采，那一刻读到的已经是黑。
		 * 反过来写就会先发一次「粉」，在启动首帧闪一下。
		 */
		function enterCaptionBoot() {
			if (state.disposed || state.captionDriving) return;
			state.captionDriving = true;
			state.captionHandoff = false;
			setAttr(CAPTION_ATTR, "boot");
			writeCaptionColor(0);
			nudgeCaptionColors();

			// 保险丝：任何一步挂掉（异常、标签页被挂起、交接流程被打断），
			// 标题条也一定会回到皮肤粉 —— 绝不留在「永远是黑条」的状态。
			try {
				if (state.captionFuseTimer) clearTimeout(state.captionFuseTimer);
				state.captionFuseTimer = setTimeout(finishCaption, CAPTION_FUSE_MS);
			} catch (e) {
				/* ignore */
			}
		}

		/**
		 * 交接：从「黑」走到「粉」，时长严格等于视频淡出（VIDEO_FADE_MS）。
		 *
		 * 为什么用 rAF 逐帧写而不是 CSS 过渡：
		 *   标题条底色是**窗口属性**，没有 transition 可用，一次赋值就是一次硬切。
		 *   唯一能做出渐变的办法是自己插值 + 每帧推一次重采，
		 *   视觉上与 CSS transition 等价（每帧一档，共约 20 档）。
		 * ★ 必须与视频淡出**同时**开始：黑条早一帧变粉，就会在还没褪干净的
		 *   黑画面上透出一块粉；晚一帧变粉，会在粉色背景上留一条黑边。
		 */
		function startCaptionHandoff() {
			if (!state.captionDriving || state.captionHandoff) return;
			state.captionHandoff = true;

			try {
				if (state.captionFuseTimer) {
					clearTimeout(state.captionFuseTimer);
					state.captionFuseTimer = 0;
				}
			} catch (e) {
				/* ignore */
			}

			var done = false;
			var base = 0;
			var finish = function () {
				if (done) return;
				done = true;
				finishCaption();
			};

			var tick = function () {
				if (done) return;
				var now;
				try {
					now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
				} catch (e) {
					now = Date.now();
				}
				if (!base) base = now;
				var t = (now - base) / VIDEO_FADE_MS;
				if (t >= 1) {
					finish();
					return;
				}
				writeCaptionColor(t);
				try {
					requestAnimationFrame(tick);
				} catch (e) {
					setTimeout(tick, 32);
				}
			};

			try {
				requestAnimationFrame(tick);
			} catch (e) {
				setTimeout(tick, 32);
			}

			// 保险丝：窗口隐藏时 rAF 会暂停，不能只靠它收尾
			try {
				state.captionFuseTimer = setTimeout(finish, VIDEO_FADE_MS + 240);
			} catch (e) {
				finish();
			}
		}

		/**
		 * 结束接管：回到皮肤粉（= skin.css §8.6 ① 的常驻态）。
		 *
		 * 顺序同样是「先摘属性、再清中间值」：清中间值那一下会触发 preload 重采，
		 * 此刻 CSS 已经回落到 ①，采到的就是粉。反序会先采到「带属性的旧值」。
		 */
		function finishCaption() {
			if (!state.captionDriving) return;
			state.captionDriving = false;
			state.captionHandoff = false;

			try {
				if (state.captionFuseTimer) {
					clearTimeout(state.captionFuseTimer);
					state.captionFuseTimer = 0;
				}
			} catch (e) {
				/* ignore */
			}

			removeAttr(CAPTION_ATTR);
			try {
				var b = document.body;
				if (b && b.style) {
					b.style.removeProperty(CAPTION_BG_VAR);
					b.style.removeProperty(CAPTION_SYM_VAR);
				}
			} catch (e) {
				/* ignore */
			}
			nudgeCaptionColors();
		}

		/* 开机 video：创建 + 播放                                              */
		/* ------------------------------------------------------------------ */

		/**
		 * 创建全屏 video 并挂到 <html> 直接子级。
		 *
		 * 为什么挂 <html> 而不是 <body>：
		 *   body 里是 DSH 的 React 根节点，往里 insertBefore 会干扰
		 *   React 对子节点的 reconcile 假设。挂在 <html> 上、
		 *   作为 #root 的兄弟节点，React 完全看不见它。
		 *
		 * 样式全部由 skin.css 的 [data-dsh-skin-boot] 规则控制，
		 * 这里只负责行为和最小内联兜底（避免皮肤 CSS 还没到时闪一下）。
		 */
		function createVideo() {
			var v;
			try {
				v = document.createElement("video");
			} catch (e) {
				return null;
			}
			v.className = "dsh-mari-boot-video";
			v.setAttribute("part", "boot-video");
			v.setAttribute("aria-hidden", "true");
			v.setAttribute("tabindex", "-1");
			v.setAttribute("disablepictureinpicture", "");
			v.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback");
			v.muted = true; // 必须静音，否则自动播放会被浏览器拦
			v.defaultMuted = true;
			v.playsInline = true;
			v.setAttribute("muted", "");
			v.setAttribute("playsinline", "");
			v.setAttribute("webkit-playsinline", "");
			// ★ 预加载：auto 让浏览器尽快缓冲首个关键帧；配合 poster=bg.jpg
			//   做到「视频没到 = 看到 bg.jpg」，绝不会白屏或黑屏。
			v.preload = "auto";
			v.poster = POSTER_URL;
			// ★ 不要设置 v.width / v.height：
			//   一旦内联了具体像素尺寸，浏览器会先按该尺寸解码再拉伸，
			//   形成「解码→缩放→再缩放」的双重采样，画面明显发糊。
			//   尺寸完全交给 CSS 的 width/height:100% + object-fit:cover。
			//
			// 内联兜底样式：即使 skin.css 未加载，它也是全屏且不挡交互。
			// ★ 取景参数（cover + center center）必须与 skin.css 里 body 的背景
			//   完全一致，否则「视频末帧 → 背景图」交接瞬间会看到画面跳一下。
			//
			// ★★ 2026-10 二次优化的关键改动（画质/帧率的真正开关）★★
			//   上一版在这里内联了：
			//     isolation:isolate; contain:paint; transform:translate3d(0,0,0);
			//     will-change:opacity;
			//   这四条会强制 Chromium 把视频帧**合成进页面图层**，
			//   从而放弃「硬件 overlay 平面直通」。后果是：
			//     · 视频帧被合成器做一次重采样 → 播放模糊（这是糊的主因）；
			//     · 全屏 60fps 每帧都过合成器 → GPU 压力翻倍、掉帧。
			//   现在：播放期**一个都不写**，让它走 overlay 直通（最锐利、最省）。
			//   需要合成层的是退场阶段 —— 由 CSS 的 .is-handoff 类按需加上
			//   （见 skin.css §8.1.1），那时画面已冻结，切换不可见。
			//
			// ★ 兜底色必须与 body/html 的兜底色一致（skin.css §1 --mari-bg-fallback）：
			//   视频没到、poster 未解码、淡到 0 的最后一刻，看到的都是同一色，
			//   不会出现白闪或粉闪。这里写死同一值作为 CSS 未加载时的兜底。
			// ★★ 内联样式里绝对不能写 opacity / filter / transition ★★
			//   内联样式的优先级高于任何类选择器（`.is-fading { opacity:0 }`），
			//   一旦把 opacity:1 内联进来，后面加多少 class 都改不动它 →
			//   视频会永远停在 opacity:1，退场彻底失效（且难以排查）。
			//   同理 filter 内联会压掉深色主题的交接压暗（§8.1.3）。
			//   所以这三个属性只由 skin.css 的类规则控制，内联只管几何与层级。
			try {
				v.style.cssText =
					"position:fixed;inset:0;width:100%;height:100%;" +
					"object-fit:cover;object-position:center center;" +
					"background:#F1C9D8 center center/cover no-repeat;" +
					"z-index:2147483000;pointer-events:none;border:0;outline:0;";
				v.style.backgroundImage = "url(" + POSTER_URL + ")";
			} catch (e) {
				/* ignore */
			}

			// 依次尝试候选源；全部失败则走 error → finishBoot
			try {
				for (var i = 0; i < VIDEO_CANDIDATES.length; i++) {
					var s = document.createElement("source");
					s.src = VIDEO_CANDIDATES[i];
					s.type = i === 0 ? "video/webm" : "video/mp4";
					v.appendChild(s);
				}
			} catch (e) {
				/* ignore */
			}

			try {
				html().appendChild(v);
			} catch (e) {
				return null;
			}
			return v;
		}

		/**
		 * ★ 2026-10 新增：预热背景图，消除「视频撤掉后底下空一帧」。
		 *
		 * 为什么需要：body 的 background-image 是惰性加载的 ——
		 * 浏览器通常要等到该元素真正参与绘制、且背景位于视口内才解码。
		 * 开机期间 body 被全屏 video 完全盖住，某些情况下背景图甚至还没开始解码。
		 * 一旦 video 被移除，那一帧就会露出兜底色（视觉上是「闪一下」），
		 * 下一帧图才出现 —— 这正是「末尾跳变」的另一个来源。
		 *
		 * 做法：用一个游离的 Image 对象预热（**不插入 DOM**，不违反
		 * 「不新增 DOM」的约束），并在 decode() 可用时等待解码完成。
		 * 全程 fail-open：任何失败都只是没预热成功，不影响任何逻辑。
		 */
		function predecodeBackground() {
			try {
				if (typeof Image !== "function") return;
				var img = new Image();
				// 与 CSS 完全同源，命中同一份 HTTP 缓存（Host 侧设了 immutable 长缓存）
				img.src = POSTER_URL;
				// decode() 返回 Promise：解码完成即已进入内存，可直接上屏
				if (typeof img.decode === "function") {
					var p = img.decode();
					if (p && typeof p.then === "function") {
						// decode() 已发起 → 解码完成即进入内存，video 撤掉那帧可直接上屏
						p.then(null, function () {
							/* 解码失败也无所谓：CSS 仍会按需加载 */
						});
					}
				}
			} catch (e) {
				/* ignore */
			}
		}

		/**
		 * 播放开机视频。任何一步失败都会 finishBoot()，绝不会卡住界面。
		 */
		function startBoot() {
			if (state.bootStarted || state.disposed) return;
			state.bootStarted = true;

			// 冻结入场：CSS 里 [data-dsh-skin-boot] 下所有入场动画为 none
			setAttr(BOOT_ATTR, "1");

			// ★ 原生标题条：不在这一刻切黑 —— 视频元素刚挂上时还在显示
			//   粉色兜底背景，此刻切黑会在粉底上留一块黑方块。
			//   真正的切换点在「第一帧真正上屏」时（见下面的 onloadeddata）。

			// 总保险丝：即使 video 事件全都不来，也要放行
			try {
				state.fuseTimer = setTimeout(function () {
					finishBoot("fuse");
				}, FUSE_MS);
			} catch (e) {
				/* ignore */
			}

			var v = createVideo();
			if (!v) {
				finishBoot("no-video-element");
				return;
			}
			state.video = v;

			// ★★ 2026-10 新增：video 已挂进 DOM（已铺满全屏、盖住一切）→
			//    立刻让入场元素进入「待命」态（藏成动画起始态）。
			//    这一步必须在用户可能看到界面之前完成，而 video 铺满的这一刻
			//    正是最早的安全时机：此刻底下无论怎么变，用户都看不见。
			//    ★ 只有挂载成功才会走到这里；创建失败 / 没有 video 的分支
			//      不会 armed，界面保持官方可见态（§8.2.1 的安全边界）。
			armEnter();

			// ★★ 2026-10 新增：提前把 bg.jpg 解码进内存。
			//    视频淡出后露出的是 body 背景图；如果它此刻才刚开始解码，
			//    就会出现「视频撤掉 → 底下空白 1~2 帧 → 图才出现」的白闪。
			//    这里在播放期间就预热（decode() 是异步、不阻塞主线程），
			//    保证淡出完成时背景图已就绪、可直接上屏。
			predecodeBackground();

			// ---- 事件 ----
			v.onended = function () {
				finishBoot("ended");
			};
			v.onerror = function () {
				finishBoot("error");
			};

			// ★ 关键：<source> 子元素加载失败时，**不会**触发 <video> 的 error 事件
			//   （HTML 规范如此）。所以必须逐个监听 <source> 的 error：
			//   全部 source 都失败 → 立刻放弃，不必傻等 VIDEO_LOAD_TIMEOUT。
			//   这样资源 404 时能秒级降级，而不是卡 4 秒。
			try {
				var sources = v.getElementsByTagName("source");
				var failed = 0;
				var total = sources.length;
				for (var si = 0; si < total; si++) {
					(function (srcEl) {
						srcEl.addEventListener("error", function () {
							failed++;
							if (failed >= total) finishBoot("all-sources-failed");
						});
					})(sources[si]);
				}
			} catch (e) {
				/* ignore */
			}

			// 元数据迟迟不来 → 跳过（网络差 / 服务端不响应时表现为一直 loading）
			try {
				state.loadTimer = setTimeout(function () {
					if (!state.video) return;
					if (state.video.readyState < 2) finishBoot("load-timeout");
				}, VIDEO_LOAD_TIMEOUT);
			} catch (e) {
				/* ignore */
			}

			// 开始真正播放后，启动「最长播放时间」保护
			v.onloadeddata = function () {
				try {
					if (state.loadTimer) {
						clearTimeout(state.loadTimer);
						state.loadTimer = 0;
					}
					state.maxTimer = setTimeout(function () {
						finishBoot("max-time");
					}, VIDEO_MAX_MS);

					// ★ 原生标题条：此刻第一帧已经解码，紧接着就会上屏 ——
					//   这是全流程里「切黑」最早的安全时机。
					//   优先用 requestVideoFrameCallback（真正上屏那一刻），
					//   没有就退回 loadeddata，再补一个 300ms 的死线兜底。
					var flipCaption = function () {
						enterCaptionBoot();
					};
					var flipped = false;
					var flipOnce = function () {
						if (flipped) return;
						flipped = true;
						flipCaption();
					};
					try {
						if (typeof v.requestVideoFrameCallback === "function") {
							v.requestVideoFrameCallback(flipOnce);
						} else {
							flipOnce();
						}
					} catch (e) {
						flipOnce();
					}
					try {
						setTimeout(flipOnce, 300);
					} catch (e) {
						flipOnce();
					}
				} catch (e) {
					/* ignore */
				}
			};

			// ---- 起播 ----
			try {
				var p = v.play();
				if (p && typeof p.then === "function") {
					p.catch(function (err) {
						// 自动播放被拦（无静音以外的原因）/ 解码失败 → 静默跳过
						warn("boot video play() rejected: " + err);
						finishBoot("play-rejected");
					});
				}
			} catch (e) {
				finishBoot("play-threw");
			}
		}

		/* ------------------------------------------------------------------ */
		/* 侧栏折叠状态镜像 → <html data-sidebar-collapsed>                    */
		/* ------------------------------------------------------------------ */

		/**
		 * 把 DSH 写在 frame 上的折叠状态同步到 <html> 上。
		 *
		 * 为什么需要：遮罩是 ::backdrop，宿主是 <html>，而 skin.css §12 的
		 * 修复规则写的是 html[data-sidebar-collapsed="true"]::backdrop。
		 * 如果不镜像，html 上永远没有这个属性，规则就永远不生效。
		 *
		 * 只做三件事，全部无损：
		 *   1. 读 frame 的属性（只读，不写 frame）
		 *   2. 在 <html> 上加/删同一个属性名
		 *   3. 归一化取值：布尔/空串/1/true 全部统一成 "true"
		 */
		function readCollapsedFrom(node) {
			try {
				if (!node || !node.getAttribute) return false;
				if (!node.hasAttribute(COLLAPSED_ATTR)) return false;
				var raw = node.getAttribute(COLLAPSED_ATTR);
				// 无值（空串）、"1"、"true" 都算折叠；"false"/"0" 算展开
				if (raw === null) return false;
				var v = String(raw).trim().toLowerCase();
				return v === "" || v === "1" || v === "true" || v === "yes" || v === "on";
			} catch (e) {
				return false;
			}
		}

		/** 找到承载折叠状态的 frame（官方是 AppFrame 根节点）。 */
		function findFrame() {
			try {
				// 优先找「自己带 data-sidebar-collapsed」的那个元素
				var direct = document.querySelector("[" + COLLAPSED_ATTR + "]");
				if (direct) return direct;
				// 否则找 AppFrame 根节点（类名含 frame）
				var cands = document.querySelectorAll('[class*="frame"]');
				for (var i = 0; i < cands.length; i++) {
					// 排除 frame 内部的子元素，只取第一层
					if (!cands[i].parentElement ||
						!cands[i].parentElement.className ||
						String(cands[i].parentElement.className).indexOf("frame") < 0) {
						return cands[i];
					}
				}
			} catch (e) {
				/* ignore */
			}
			return null;
		}

		/**
		 * 安装左侧栏折叠状态监听（**仅用于 ::backdrop 遮罩**）。
		 *
		 * ⚠ 与右侧栏不同：右栏折叠已改为纯 CSS（skin.css §14），
		 *   本函数只服务于「左侧遮罩」这一个 JS 才能解决的问题。
		 *
		 * ── 为什么遮罩必须用 JS ──────────────────────────────────────────────
		 * ::backdrop 是伪元素：
		 *   · 不能用 element.style 内联设置（伪元素没有 style 对象）；
		 *   · 只能由样式表规则控制，而样式表规则需要 <html> 上有对应属性；
		 *   · 但 DSH 把折叠状态写在 **frame** 上，<html> 上没有。
		 * 所以必须用 JS 把状态「镜像」到 <html>，再配合 CSS 变量控制遮罩。
		 *
		 * ── 双通道 ──────────────────────────────────────────────────────────
		 *   ① 同步通道：包装 frame 的 setAttribute / removeAttribute，
		 *      在官方写入的同一调用栈内完成镜像 → 不会闪白帧。
		 *   ② 异步通道：MutationObserver 兜底（React 绕过实例方法时补上）。
		 *
		 * 两条通道都只「读 frame、写 <html>」，绝不回写 frame。
		 *
		 * @returns {Function} 卸载函数
		 */
		function installCollapsedMirror() {
			var observers = [];
			var attached = [];
			var patched = [];

			/** 同步包装：接管一个元素上的属性写入。 */
			function patchSync(node) {
				if (!node || patched.some(function (p) { return p.node === node; })) return;
				try {
					var origSet = node.setAttribute;
					var origRemove = node.removeAttribute;
					if (typeof origSet !== "function" || typeof origRemove !== "function") return;

					node.setAttribute = function (name, value) {
						var r = origSet.apply(this, arguments);
						try {
							if (String(name) === COLLAPSED_ATTR) {
								applyBackdrop(readCollapsedFrom(this));
							}
						} catch (e) {
							/* ignore */
						}
						return r;
					};
					node.removeAttribute = function (name) {
						var r = origRemove.apply(this, arguments);
						try {
							if (String(name) === COLLAPSED_ATTR) {
								applyBackdrop(readCollapsedFrom(this));
							}
						} catch (e) {
							/* ignore */
						}
						return r;
					};

					patched.push({ node: node, set: origSet, remove: origRemove });
				} catch (e) {
					/* 某些环境不允许改写实例方法：忽略，交给 MutationObserver */
				}
			}

			function attach(node) {
				if (!node || attached.indexOf(node) >= 0) return;
				try {
					patchSync(node);
					var mo = new MutationObserver(function () {
						applyBackdrop(readCollapsedFrom(node));
					});
					mo.observe(node, { attributes: true, attributeFilter: [COLLAPSED_ATTR] });
					observers.push(mo);
					attached.push(node);
					// 挂上时先同步一次当前状态
					applyBackdrop(readCollapsedFrom(node));
				} catch (e) {
					/* ignore */
				}
			}

			// 立刻尝试；frame 可能还没挂载，DOMContentLoaded 后补
			attach(findFrame());
			try {
				if (document.readyState === "loading") {
					document.addEventListener("DOMContentLoaded", function () {
						attach(findFrame());
					}, { once: true });
				}
			} catch (e) {
				/* ignore */
			}

			// React 可能在路由切换时重建 frame，用轻量 observer 补挂
			var bodyMo = null;
			try {
				bodyMo = new MutationObserver(function () {
					var f = findFrame();
					if (f && attached.indexOf(f) < 0) attach(f);
				});
				if (document.body) {
					bodyMo.observe(document.body, { childList: true, subtree: false });
				}
			} catch (e) {
				/* ignore */
			}

			return function () {
				// 还原被包装的方法
				for (var p = 0; p < patched.length; p++) {
					try {
						if (patched[p].node.setAttribute) patched[p].node.setAttribute = patched[p].set;
						if (patched[p].node.removeAttribute)
							patched[p].node.removeAttribute = patched[p].remove;
					} catch (e) {
						/* ignore */
					}
				}
				for (var i = 0; i < observers.length; i++) {
					try {
						observers[i].disconnect();
					} catch (e) {
						/* ignore */
					}
				}
				try {
					if (bodyMo) bodyMo.disconnect();
				} catch (e) {
					/* ignore */
				}
				// 卸载时清掉镜像属性
				try {
					var doc = html();
					if (doc) {
						doc.removeAttribute(COLLAPSED_ATTR);
						doc.removeAttribute(COLLAPSED_MIRROR);
					}
				} catch (e) {
					/* ignore */
				}
			};
		}

		/**
		 * ★ 核心：按折叠状态控制弹窗遮罩（::backdrop）。
		 *
		 * ── 为什么要用 JS，而不是纯 CSS ────────────────────────────────────
		 * 实测结论（Edge/Chromium）：
		 *
		 *   ① ::backdrop 由「进入 top layer 的元素」自动生成，宿主是 <html>；
		 *   ② **不能**用 element.style 内联设置它 ——
		 *      element.style 只作用于元素本身，伪元素没有 style 对象；
		 *      element.style.setProperty('::backdrop', ...) 会被静默忽略
		 *      （不报错，但完全不生效，这是最难排查的一类问题）；
		 *   ③ **可以**由样式表规则控制（<style> 或 adoptedStyleSheets）。
		 *
		 * 上一版的纯 CSS 方案写的是：
		 *      html[data-sidebar-collapsed="true"]::backdrop { opacity:0 !important }
		 * 该规则本身有效，但它要求 <html> 上真的存在这个属性；
		 * 而 DSH 把折叠状态写在 **frame 元素**上 —— <html> 上并没有。
		 * 既然无论如何都要用 JS 把状态同步过去，不如把「开关」也一并交给 JS，
		 * 避免「镜像属性 + 属性选择器 + !important」三套机制互相牵制。
		 *
		 * ── 本函数怎么控 ────────────────────────────────────────────────────
		 * 不增删 DOM 节点，也不改 DSH 的任何元素样式，只做两件事：
		 *   1. 在 <html> 上写两个 CSS 变量（--mari-backdrop-opacity /
		 *      --mari-backdrop-pointer-events）；
		 *   2. 首次调用时通过 adoptedStyleSheets 注入一条使用这两个变量的
		 *      ::backdrop 规则（不产生 <style> 节点；不支持时回退到 <style>）。
		 *
		 * 于是「隐藏遮罩」= 把变量改成 0 / none，
		 *      「显示遮罩」= 把变量改回 1 / auto。
		 * 全程只改变量值，不反复增删样式表，切换开销接近零。
		 *
		 * ── 容错 ────────────────────────────────────────────────────────────
		 * 任何一步失败都保持「遮罩正常显示」（变量默认值 1 / auto），
		 * 绝不会因为插件异常而误伤界面。
		 *
		 * @param {boolean} collapsed 侧栏是否折叠
		 */
		function applyBackdrop(collapsed) {
			try {
				var doc = html();
				if (!doc) return;

				// 第一次调用时准备好 ::backdrop 规则
				ensureBackdropSheet();

				// 写变量：折叠 → 0 / none；展开 → 1 / auto
				doc.style.setProperty(BD_OPACITY_VAR, collapsed ? "0" : "1");
				doc.style.setProperty(BD_EVENTS_VAR, collapsed ? "none" : "auto");

				// 同步镜像属性，供 CSS 侧的「即时兜底」规则（skin.css §12.3）使用。
				// 这一步只增加一个 data-* 属性，零结构改动。
				if (collapsed) {
					if (doc.getAttribute(COLLAPSED_ATTR) !== "true") {
						doc.setAttribute(COLLAPSED_ATTR, "true");
					}
					doc.setAttribute(COLLAPSED_MIRROR, "true");
				} else {
					if (doc.hasAttribute(COLLAPSED_ATTR)) doc.removeAttribute(COLLAPSED_ATTR);
					doc.removeAttribute(COLLAPSED_MIRROR);
				}
			} catch (e) {
				/* 失败就保持默认：遮罩正常显示，界面不受影响 */
			}
		}

		/**
		 * 准备 ::backdrop 的控制规则（只执行一次）。
		 *
		 * 优先 adoptedStyleSheets：它是纯 CSSOM 对象，**不产生 DOM 节点**。
		 * 老浏览器不支持时回退到 <style>（会多一个节点，但只多这一个，
		 * 且挂在 <head> 里不参与布局；卸载时一并移除）。
		 */
		function ensureBackdropSheet() {
			if (state.backdropSheetReady) return;
			state.backdropSheetReady = true;

			var css =
				"html::backdrop{" +
				"opacity:var(" + BD_OPACITY_VAR + ",1)!important;" +
				"pointer-events:var(" + BD_EVENTS_VAR + ",auto)!important;" +
				"background-color:var(--mari-backdrop-bg,rgba(255,250,253,.86));" +
				"}";

			// ① 首选：adoptedStyleSheets（无 DOM 节点）
			try {
				if (typeof CSSStyleSheet === "function" && "adoptedStyleSheets" in document) {
					var sheet = new CSSStyleSheet();
					sheet.replaceSync(css);
					document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sheet]);
					state.backdropSheet = sheet;
					return;
				}
			} catch (e) {
				/* 落到 <style> 回退 */
			}

			// ② 回退：动态 <style>
			try {
				var st = document.createElement("style");
				st.setAttribute("data-dsh-mari-skin", "backdrop");
				st.textContent = css;
				(document.head || document.documentElement).appendChild(st);
				state.backdropStyleEl = st;
			} catch (e) {
				/* 两条路都失败：skin.css §12.2 的静态规则仍能兜住 */
			}
		}

		/** 卸载时清理遮罩控制，把页面还回原生状态。 */
		function disposeBackdrop() {
			try {
				state.backdropSheetReady = false;
				// 移除注入的样式表
				if (state.backdropSheet) {
					document.adoptedStyleSheets = document.adoptedStyleSheets.filter(function (s) {
						return s !== state.backdropSheet;
					});
					state.backdropSheet = null;
				}
				if (state.backdropStyleEl) {
					if (state.backdropStyleEl.parentNode) {
						state.backdropStyleEl.parentNode.removeChild(state.backdropStyleEl);
					}
					state.backdropStyleEl = null;
				}
				// 清掉变量与镜像属性，避免把状态留给下一个插件
				var doc = html();
				if (doc) {
					doc.style.removeProperty(BD_OPACITY_VAR);
					doc.style.removeProperty(BD_EVENTS_VAR);
					doc.removeAttribute(COLLAPSED_ATTR);
					doc.removeAttribute(COLLAPSED_MIRROR);
				}
			} catch (e) {
				/* ignore */
			}
		}

		/* ------------------------------------------------------------------ */
		/* 右侧栏折叠：已改为纯 CSS 方案（见 skin.css §14）                    */
		/* ------------------------------------------------------------------ */
		/*
		 * ★ 2026-10 变更：此处原有的 JS 监听全部移除。
		 *
		 * 移除的原因（需求要求「纯 CSS 根治」）：
		 *   1. 折叠状态属性由官方写在 frame 上，CSS 属性选择器本就能直接选中，
		 *      不需要 JS 中转；
		 *   2. JS 动态写内联样式有几个固有代价：
		 *      · 需要记录/还原原值，逻辑复杂且容易在 React 重渲染后失效；
		 *      · 必须先包装 setAttribute 才能消除一帧白闪，属于侵入式手段；
		 *      · 节点被 React 替换后内联样式丢失，要额外用 MutationObserver 补。
		 *   3. 纯 CSS 没有时序问题：属性一变，样式同一帧生效，天然无白闪。
		 *
		 * 现在的做法：skin.css §14 用
		 *   :root[data-rightbar-collapsed] [data-sidebar-right-panel]
		 *   :root[data-rightbar-collapsed] [data-sidebar-right-guide]
		 *   :root[data-rightbar-collapsed] .detailsCol
		 * 直接在折叠态把三层宽高归零、透明、禁点，展开时规则自动失效、
		 * 官方样式自然恢复 —— 无需任何还原逻辑。
		 *
		 * 已删除的函数（如后续需要可参考 git 历史）：
		 *   applyRightPanel / applyRightPanelDebounced / readRightbarCollapsed
		 *   collectRightPanelNodes / setRightPanelState / disposeRightPanel
		 *   installRightPanelWatch
		 *
		 * 注意：state 中原有的 rpRaf / rpTimer 防抖字段也已一并移除。
		 */

		/* ------------------------------------------------------------------ */
		/* 挂载                                                                */
		/* ------------------------------------------------------------------ */

		/**
		 * 不依赖任何服务：声明 [] 而不是写一堆服务名。
		 * 声明了没人 provide 的服务会让 fiber 停在 PENDING，拖住整棵插件树。
		 */
		var inject = [];

		function apply(ctx) {
			try {
				// ---- ?noskin=1：整页关闭 --------------------------------------
				if (skinDisabled()) {
					release();
					return;
				}

				setAttr(ATTR, VALUE);

				// ---- ★ 原生窗口按钮：先修正一次配色（修「按钮色差」）--------
				// preload 的首次取色很可能发生在 data-dsh-skin 打上之前，
				// 读到的是官方配色。这里补一次重采，让 WCO 立刻用皮肤令牌重绘；
				// 否则按钮会一直停在官方色上，与皮肤背景明显不协调。
				nudgeCaptionColorsLater();

				// ---- ★ 侧栏折叠状态镜像（::backdrop 修复的前提）--------------
				// 必须在其它逻辑之前装上：遮罩可能在界面首帧就存在，
				// 越早镜像，越不会出现「白雾闪一下再消失」。
				var unmirror = null;
				try {
					unmirror = installCollapsedMirror();
				} catch (e) {
					warn("collapsed mirror failed: " + e);
				}

				// ---- 右侧栏折叠：已改为纯 CSS（skin.css §14），此处无需挂载 ----

				// ---- 决定走哪条路 --------------------------------------------
				// 1) 已播过 / 减少动效 / 显式跳过 → 直接放行，不建 video
				if (alreadyBooted() || prefersReducedMotion() || query("noboot") === "1") {
					fireGo();
				} else {
					// 2) 首次加载 → 播开机视频，播完再放行
					startBoot();
				}

				// ---- 卸载清理 ------------------------------------------------
				if (ctx && typeof ctx.effect === "function") {
					ctx.effect(function () {
						return function () {
							state.disposed = true;
							clearTimers();
							disposeVideo();
							try {
								if (unmirror) unmirror();
							} catch (e) {
								/* ignore */
							}
							release();
						};
					});
				}
			} catch (e) {
				// 任何异常都不能让插件崩：先把界面放出来
				warn("client init failed: " + e);
				try {
					state.disposed = false;
					finishBoot("apply-threw");
				} catch (_) {
					/* ignore */
				}
			}
		}

		/** 关掉皮肤：摘属性 + 清 video + 清镜像。 */
		function release() {
			disposeVideo();
			disposeBackdrop();
			/* ★ armed 必须一起摘：否则元素会停在 opacity:0 的动画起始态，
			   ?noskin=1 之后整屏空白 —— 这是本版最容易踩的坑。 */
			disarmEnter();

			/* ★ 原生标题条：无条件回到皮肤粉。
			   卸载 / ?noskin=1 时如果还留着接管属性，标题条会永远停在开场黑上
			   —— 那比色差严重得多。 */
			try {
				if (state.captionFuseTimer) {
					clearTimeout(state.captionFuseTimer);
					state.captionFuseTimer = 0;
				}
			} catch (e) {
				/* ignore */
			}
			state.captionDriving = false;
			state.captionHandoff = false;
			removeAttr(CAPTION_ATTR);
			try {
				var cbody = document.body;
				if (cbody && cbody.style) {
					cbody.style.removeProperty(CAPTION_BG_VAR);
					cbody.style.removeProperty(CAPTION_SYM_VAR);
				}
			} catch (e) {
				/* ignore */
			}
			nudgeCaptionColors();

			removeAttr(BOOT_ATTR);
			removeAttr(GO_ATTR);
			removeAttr(COLLAPSED_ATTR);
			removeAttr(COLLAPSED_MIRROR);
			try {
				var doc = html();
				if (doc && doc.getAttribute(ATTR) === VALUE) doc.removeAttribute(ATTR);
			} catch (e) {
				/* ignore */
			}
		}

		exports.apply = apply;
		exports.inject = inject;

		// 供预览页 / 调试使用：不依赖 DSH 也能手动触发一次完整开机
		exports.replay = function () {
			try {
				removeAttr(BOOTED_ATTR);
				if (window.sessionStorage) sessionStorage.removeItem(STORAGE_KEY);
			} catch (e) {
				/* ignore */
			}
			state.goFired = false;
			state.bootStarted = false;
			state.fading = false;
			// 重播前把标题条接管状态归零，否则 enterCaptionBoot 会因为
			// 「已在接管中」直接 return，第二轮开场就是粉的。
			state.captionDriving = false;
			state.captionHandoff = false;
			disarmEnter(); // 重播前先归零，否则第二轮不会有「待命 → 淡入」
			removeAttr(GO_ATTR);
			startBoot();
		};

		return module.exports;
	},
});

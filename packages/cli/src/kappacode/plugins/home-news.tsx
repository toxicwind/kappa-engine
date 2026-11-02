import type { TuiPlugin, TuiPluginModule } from "@kappacode/plugin/tui"
import { createMemo, Show } from "solid-js"
import { KappaNews } from "@/kappacode/components/kappa-news"

const id = "internal:home-news"

// kappacode_change start - advertiser nags off by default.
// KappaNews renders server-pushed Kilo notifications (promos such as
// "Try Kilo with Your Team · Free for 14 Days"). Opt-in only: set
// KAPPA_NEWS_BANNER=1 to restore the home-screen news banner. The rest of
// the Kilo ecosystem (gateway auth, model routing, /connect) is unaffected.
const newsBannerEnabled = () => process.env.KAPPA_NEWS_BANNER === "1"
// kappacode_change end

const tui: TuiPlugin = async (api) => {
  api.keymap.registerLayer({
    commands: [
      {
        namespace: "palette",
        name: "news.toggle",
        get title() {
          return api.kv.get("news_hidden", false) ? "Show news" : "Hide news"
        },
        category: "System",
        get hidden() {
          return api.route.current.name !== "home"
        },
        run() {
          api.kv.set("news_hidden", !api.kv.get("news_hidden", false))
          api.ui.dialog.clear()
        },
      },
    ],
    bindings: api.tuiConfig.keybinds.gather("home.news", ["news.toggle"]),
  })

  api.slots.register({
    order: 50,
    slots: {
      home_bottom() {
        const hidden = createMemo(() => api.kv.get("news_hidden", false))
        return (
          <box width="100%" maxWidth={75} alignItems="center" paddingTop={2}>
            <Show when={newsBannerEnabled() && !hidden()}>
              <KappaNews />
            </Show>
          </box>
        )
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin

export type {
  DesktopTheme,
  ThemeSeedColors,
  ThemeVariant,
  HexColor,
  OklchColor,
  ResolvedTheme,
  ColorValue,
  CssVarRef,
} from "@toxicwind/ui/theme/types"

export {
  hexToRgb,
  rgbToHex,
  hexToOklch,
  oklchToHex,
  rgbToOklch,
  oklchToRgb,
  generateScale,
  generateNeutralScale,
  generateAlphaScale,
  mixColors,
  lighten,
  darken,
  withAlpha,
} from "@toxicwind/ui/theme/color"

export { resolveThemeVariant, resolveTheme, themeToCss } from "@toxicwind/ui/theme/resolve"
export { applyTheme, loadThemeFromUrl, getActiveTheme, removeTheme, setColorScheme } from "@toxicwind/ui/theme/loader"

// Override: use our context with kappa default
export { ThemeProvider, useTheme, type ColorScheme } from "./context"

// Override: use our default-themes which includes Kappa themes
export {
  DEFAULT_THEMES,
  kappaTheme,
  kappaVscodeTheme,
  oc2Theme,
  tokyonightTheme,
  draculaTheme,
  monokaiTheme,
  solarizedTheme,
  nordTheme,
  catppuccinTheme,
  ayuTheme,
  oneDarkProTheme,
  shadesOfPurpleTheme,
  nightowlTheme,
  vesperTheme,
  carbonfoxTheme,
  gruvboxTheme,
  auraTheme,
} from "./default-themes"

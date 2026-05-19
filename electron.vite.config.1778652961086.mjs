// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
var __electron_vite_injected_dirname = "D:\\The future of the world's HCI";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "electron/main.ts")
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "electron/preload.ts")
        }
      }
    }
  },
  renderer: {
    root: ".",
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "index.html")
        }
      }
    },
    resolve: {
      alias: {
        "@renderer": resolve("src")
      }
    },
    plugins: [react(), tailwindcss()]
  }
});
export {
  electron_vite_config_default as default
};

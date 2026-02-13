import { createRoot } from "react-dom/client"
import { App } from "./App"
import "./styles/global.css"
import "@xterm/xterm/css/xterm.css"

const root = createRoot(document.getElementById("root")!)
root.render(<App />)

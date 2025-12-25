import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
	plugins: [react()],
	base: "/recipe-chat/", // <-- replace with "/<YOUR_REPO>/"
});

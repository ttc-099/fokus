import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import LearningPath from "./pages/LearningPath";
import NewPage from "./pages/NewPage";
import Settings from "./pages/Settings";
import "./index.css";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<LearningPath />} />
        <Route path="new-page" element={<NewPage />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
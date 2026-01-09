import Beams from "./components/Beams";
import "./beams.css";

export default function App() {
  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* Fullscreen background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          pointerEvents: "none",
        }}
      >
        <Beams
          beamWidth={2}
          beamHeight={15}
          beamNumber={12}
          lightColor="#8565e2"
          speed={2}
          noiseIntensity={1.75}
          scale={0.2}
          rotation={0}
        />
      </div>
    </div>
  );
}

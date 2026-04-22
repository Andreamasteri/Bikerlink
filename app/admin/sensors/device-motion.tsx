import { SensorScreen } from "./_sensor-screen";

export default function DeviceMotionScreen() {
  return (
    <SensorScreen
      def={{
        key: "deviceMotion",
        name: "DeviceMotion",
        platform: "cross",
        defaultConfig: '{"interval": 500}',
      }}
    />
  );
}

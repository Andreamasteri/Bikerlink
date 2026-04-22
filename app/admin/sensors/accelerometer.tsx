import { SensorScreen } from "./_sensor-screen";

export default function AccelerometerScreen() {
  return (
    <SensorScreen
      def={{
        key: "accelerometer",
        name: "Accelerometer",
        platform: "cross",
        defaultConfig: '{"interval": 500}',
      }}
    />
  );
}

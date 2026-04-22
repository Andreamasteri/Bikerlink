import { SensorScreen } from "./_sensor-screen";

export default function GyroscopeScreen() {
  return (
    <SensorScreen
      def={{
        key: "gyroscope",
        name: "Gyroscope",
        platform: "cross",
        defaultConfig: '{"interval": 500}',
      }}
    />
  );
}

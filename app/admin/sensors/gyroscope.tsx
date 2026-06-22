import { SensorScreen } from "@/components/admin/sensors/sensor-screen";

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

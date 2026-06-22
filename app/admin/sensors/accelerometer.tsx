import { SensorScreen } from "@/components/admin/sensors/sensor-screen";

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

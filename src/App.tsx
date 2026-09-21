import { useMemo } from 'react';
import { Chart } from '@/components/Chart';
import { generateMockBars } from '@/data/mockData';

export default function App() {
  const bars = useMemo(() => generateMockBars(500), []);
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#131722' }}>
      <Chart bars={bars} />
    </div>
  );
}

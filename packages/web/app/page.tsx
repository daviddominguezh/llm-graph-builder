import dynamic from 'next/dynamic';

const GraphBuilder = dynamic(
  () => import('./components/GraphBuilder').then((mod) => mod.GraphBuilder),
  { ssr: false }
);

export default function Page(): React.JSX.Element {
  return <GraphBuilder />;
}

import { PlayView } from './play2d/PlayView';
import { hornsPlay } from './samples/horns';

export default function App() {
  return <PlayView play={hornsPlay} />;
}

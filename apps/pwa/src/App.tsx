import { EditorContextProvider } from './editor/EditorContextProvider';
import { PlayView } from './play2d/PlayView';
import { hornsPlay } from './samples/horns';

export default function App() {
  return (
    <EditorContextProvider initialPlay={hornsPlay}>
      <PlayView />
    </EditorContextProvider>
  );
}

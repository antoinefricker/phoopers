import { Container, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export default function App() {
  const { t } = useTranslation();

  return (
    <Container>
      <Title order={1}>{t('app.title', 'Phoopers')}</Title>
      <Text>{t('app.tagline', 'Design and replay basketball plays')}</Text>
    </Container>
  );
}

import { AppProps } from 'next/app';
import Head from 'next/head';
import { AppLayout } from '../components/layout/AppLayout';
import './styles.css';

function CustomApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Notiflo</title>
      </Head>
      <AppLayout>
        <Component {...pageProps} />
      </AppLayout>
    </>
  );
}

export default CustomApp;

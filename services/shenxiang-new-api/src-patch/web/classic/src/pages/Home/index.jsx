/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useCallback, useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { Spin } from '@douyinfe/semi-ui';
import { API, showError } from '../../helpers';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { useActualTheme } from '../../context/Theme';
import { marked } from 'marked';
import { useTranslation } from 'react-i18next';
import TextWorkbench from './TextWorkbench';

const Home = () => {
  const { i18n } = useTranslation();
  const actualTheme = useActualTheme();
  const isMobile = useIsMobile();
  const iframeRef = useRef(null);
  const [loadedIframeUrl, setLoadedIframeUrl] = useState('');
  const [homePageContentLoaded, setHomePageContentLoaded] = useState(false);
  const [homePageContent, setHomePageContent] = useState('');

  const displayHomePageContent = useCallback(async () => {
    setHomePageContent(DOMPurify.sanitize(localStorage.getItem('home_page_content') || ''));
    const res = await API.get('/api/home_page_content');
    const { success, message, data } = res.data;
    if (success) {
      let content = String(data || '');
      if (content && !content.startsWith('https://')) {
        content = DOMPurify.sanitize(marked.parse(content));
      }
      setHomePageContent(content);
      localStorage.setItem('home_page_content', content);
    } else {
      showError(message);
      setHomePageContent('加载首页内容失败...');
    }
    setHomePageContentLoaded(true);
  }, []);

  useEffect(() => {
    displayHomePageContent().then();
  }, [displayHomePageContent]);

  useEffect(() => {
    if (
      !homePageContent.startsWith('https://') ||
      loadedIframeUrl !== homePageContent
    ) {
      return;
    }

    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    let targetOrigin;
    try {
      targetOrigin = new URL(homePageContent).origin;
    } catch {
      return;
    }
    iframe.contentWindow.postMessage({ themeMode: actualTheme }, targetOrigin);
    iframe.contentWindow.postMessage({ lang: i18n.language }, targetOrigin);
  }, [homePageContent, loadedIframeUrl, actualTheme, i18n.language]);

  useEffect(() => {
    document.body.classList.add('sx-home-active');
    return () => {
      document.body.classList.remove('sx-home-active');
    };
  }, []);

  return (
    <div className='classic-page-fill classic-home-page w-full overflow-x-hidden'>
      {!homePageContentLoaded ? (
        <div className='sx-workbench-loading-page'>
          <Spin size='large' />
        </div>
      ) : homePageContent === '' ? (
        <div className='classic-home-default w-full overflow-x-hidden'>
          <main className='classic-home-hero sx-home-shell'>
            <TextWorkbench
              isMobile={isMobile}
            />
          </main>
        </div>
      ) : (
        <div className='classic-page-fill overflow-x-hidden w-full'>
          {homePageContent.startsWith('https://') ? (
            <iframe
              key={homePageContent}
              ref={iframeRef}
              src={homePageContent}
              className='w-full h-full border-none'
              onLoad={() => setLoadedIframeUrl(homePageContent)}
            />
          ) : (
            <div
              className='mt-[60px]'
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(homePageContent),
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default Home;

import { t, tr, getLanguage } from "../../releases/1.0.0/locale.js";
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Share } from '@capacitor/share';
const Keepsake = registerPlugin('Keepsake');
const Ads = registerPlugin('ThenusAds');
const Account = registerPlugin('ThenusAccount');
import { roomFromURL } from './links.js';
export async function installNative() {
  if (!Capacitor.isNativePlatform()) return;
  window.__NATIVE__ = {
    share: options => Share.share({
      ...options,
      dialogTitle: t("친구 초대하기")
    }),
    exit: () => App.exitApp(),
    account: {
      status: () => Account.status(),
      billingStatus: () => Account.billingStatus(),
      billingBuy: () => Account.billingBuy(),
      billingRestore: () => Account.billingRestore(),
      signIn: () => Account.signIn(),
      signOut: () => Account.signOut(),
      deleteAccount: options => Account.deleteAccount({confirmed:options?.confirmed===true})
    },
    ads: {
      showAtBreak: options => Ads.showAtBreak({...options, language: getLanguage()}),
      privacy: () => Ads.privacy({language: getLanguage()}),
      ageChoice: () => Ads.ageChoice({language: getLanguage()})
    },
    async saveFile(blob, filename) {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return Keepsake.save({
        data,
        filename,
        mimeType: blob.type.split(';')[0]
      });
    }
  };
  await Account.addListener('billingChanged',()=>window.dispatchEvent(new Event('thenus-purchases')));
  window.__ADS_STATUS__ = await Ads.status().catch(() => ({enabled:false, testMode:false}));
  await App.addListener('backButton', () => window.dispatchEvent(new Event('thenus-back')));
  await App.addListener('appStateChange', ({
    isActive
  }) => {
    if (isActive) window.dispatchEvent(new Event('online'));
  });
  await App.addListener('appUrlOpen', ({
    url
  }) => {
    const code = roomFromURL(url);
    if (code) window.dispatchEvent(new CustomEvent('thenus-invite', {
      detail: code
    }));
  });
  const initial = await App.getLaunchUrl(),
    code = roomFromURL(initial?.url);
  if (code) history.replaceState({}, '', '?room=' + code);
}

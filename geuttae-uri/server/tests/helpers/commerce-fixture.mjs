// Injectable test adapter. The production launcher never imports this module.
import {randomUUID} from 'node:crypto';
import {createReceiptVerifier,CommerceError} from '../../src/commerce.mjs';
export function commerceFixture({now=()=>Date.now()}={}){
  const purchases=new Map(),refunds=new Map(),accounts=new Map();
  const verifier=createReceiptVerifier({
    async purchase(receipt){if(!purchases.has(receipt))throw new CommerceError('INVALID_RECEIPT','확인할 수 없는 테스트 영수증이에요.',400);return {...purchases.get(receipt)};},
    async revocation(notification){if(!refunds.has(notification))throw new CommerceError('INVALID_REVOCATION','확인할 수 없는 테스트 환불이에요.',400);return {...refunds.get(notification)};}
  });
  return {verifier,resolveAccount:({session})=>accounts.get(session.id)||null,
    bind(sessionId,accountId){accounts.set(sessionId,accountId);},
    issue(accountId,productId,extra={}){const receipt='fixture-'+randomUUID(),value={provider:'fixture',transactionId:randomUUID(),accountId,productId,purchasedAt:now(),...extra};purchases.set(receipt,value);return {receipt,value};},
    refund(transactionId,extra={}){const notification='fixture-'+randomUUID();refunds.set(notification,{provider:'fixture',transactionId,eventId:randomUUID(),revokedAt:now(),...extra});return notification;}
  };
}

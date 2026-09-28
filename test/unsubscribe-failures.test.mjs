import test from 'node:test';
import assert from 'node:assert/strict';
import { unsubscribeNewsletterContact } from '../shared/newsletterEngagement.js';
function mock(lookupError,updateError){return {from(){return {select(){return {ilike(){return {maybeSingle:async()=>({data:lookupError?null:{id:1,newsletter_notes:null},error:lookupError})}}}},update(values){assert.equal(values.newsletter_subscribed,false);return {eq:async()=>({error:updateError})}}}}}}
test('database lookup failure cannot report unsubscribe success',async()=>{await assert.rejects(unsubscribeNewsletterContact(mock(new Error('offline'),null),'reader@example.com'),/offline/)});
test('database write failure cannot report unsubscribe success',async()=>{await assert.rejects(unsubscribeNewsletterContact(mock(null,new Error('write failed')),'reader@example.com'),/write failed/)});
test('successful unsubscribe disables newsletters',async()=>{assert.deepEqual(await unsubscribeNewsletterContact(mock(null,null),'reader@example.com'),{updated:true})});

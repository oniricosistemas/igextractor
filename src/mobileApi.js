'use strict';

const axios = require('axios');
const crypto = require('crypto');
const { dbg } = require('./debug');

// ─── Constants ───────────────────────────────────────────────────────────────

const IG_MOBILE_BASE = 'https://i.instagram.com';
const GRAPHQL_QUERY_URL = 'https://i.instagram.com/graphql/query';
const MOBILE_USER_AGENT = 'Instagram 428.0.0.47.67 Android (34/14; 480dpi; 1344x2992; Google/google; Pixel 8 Pro; husky; husky; en_US; 961145276)';
const MOBILE_APP_ID = '936619743392459';
const BLOKS_VERSION_ID = '7189b949425f9bf80ea8bd880cf5a3080b292d9b1c4b38a18d112f7c4b71e7a8';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;
const PAGE_DELAY_MS = 10000; // 10s fijo entre páginas para evitar rate limiting
const DEFAULT_MAX_RESULTS = 5000; // Límite de resultados para followers/following

// GraphQL doc IDs (from instagrapi)
const GQL_FOLLOWERS_DOC_ID = '28479704797510738576165798526';
const GQL_FOLLOWING_DOC_ID = '161046392817718486717479294775';

// ─── State ───────────────────────────────────────────────────────────────────

let _deviceIds = null;
let _rankUuid = null;

// ─── Device ID Generation ────────────────────────────────────────────────────

function generateDeviceIds() {
  if (_deviceIds) return _deviceIds;
  _deviceIds = {
    deviceId: crypto.randomUUID(),
    familyDeviceId: crypto.randomUUID(),
    androidId: crypto.randomBytes(8).toString('hex'),
  };
  return _deviceIds;
}

// ─── Rank Token ──────────────────────────────────────────────────────────────

function rankToken(userId) {
  if (!_rankUuid) _rankUuid = crypto.randomUUID();
  return `${userId}_${_rankUuid}`;
}

// ─── Header Construction ─────────────────────────────────────────────────────

function buildMobileHeaders(sessionId, csrfToken) {
  const ids = generateDeviceIds();
  const cookieParts = [`sessionid=${sessionId}`];
  if (csrfToken) cookieParts.push(`csrftoken=${csrfToken}`);

  return {
    'User-Agent': MOBILE_USER_AGENT,
    'X-IG-App-ID': MOBILE_APP_ID,
    'X-IG-Device-ID': ids.deviceId,
    'X-IG-Family-Device-ID': ids.familyDeviceId,
    'X-IG-Android-ID': `android-${ids.androidId}`,
    'X-Bloks-Version-Id': BLOKS_VERSION_ID,
    'X-IG-Capabilities': '3brTv10=',
    'X-IG-Connection-Type': 'WIFI',
    'X-IG-WWW-Claim': '0',
    'X-IG-App-Locale': 'en_US',
    'X-IG-Device-Locale': 'en_US',
    'X-IG-App-Startup-Country': 'US',
    'X-IG-Timezone-Offset': '-10800',
    'X-IG-Bandwidth-Speed-KBPS': '2500',
    'X-IG-Bandwidth-TotalBytes-B': '5000000',
    'X-IG-Bandwidth-TotalTime-MS': '3000',
    'Priority': 'u=3',
    'Accept-Language': 'en-US',
    'Accept': '*/*',
    'Cookie': cookieParts.join('; '),
  };
}

// ─── Mobile Fetch with Retry ─────────────────────────────────────────────────

async function mobileFetch(url, headers) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await axios.get(url, { headers, timeout: 15000 });
      return resp.data;
    } catch (err) {
      const status = err.response?.status;
      const body = err.response?.data;
      // Detect Instagram rate limiting (HTTP 400 with feedback_required / is_spam)
      if (status === 400 && body && body.feedback_required) {
        throw new Error(`RATE_LIMITED: feedback_required — ${body.feedback_title || 'Try Again Later'}`);
      }
      if (status === 429 && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (status === 401 || status === 403) {
        throw new Error(`AUTH_ERROR: ${status} — session may be invalid or expired`);
      }
      if (attempt === MAX_RETRIES) {
        throw new Error(`MOBILE_FETCH_FAILED: ${status || err.message}`);
      }
      await new Promise(r => setTimeout(r, BASE_DELAY_MS));
    }
  }
}

// ─── GraphQL POST with Retry ─────────────────────────────────────────────────
// Auth detection operates at two layers:
//   1. HTTP transport (this function): catches 401/403 status codes
//   2. Application layer (graphqlFetchFollowers/Following): catches login_required
//      in response body when Instagram returns HTTP 200 with auth errors
// Both throw AUTH_ERROR for consistent handling upstream.

async function graphqlPost(url, data, headers) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await axios.post(url, data, { headers, timeout: 15000 });
      return resp.data;
    } catch (err) {
      const status = err.response?.status;
      const body = err.response?.data;
      // Detect Instagram rate limiting (HTTP 400 with feedback_required / is_spam)
      if (status === 400 && body && body.feedback_required) {
        throw new Error(`RATE_LIMITED: feedback_required — ${body.feedback_title || 'Try Again Later'}`);
      }
      if (status === 429 && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (status === 401 || status === 403) {
        throw new Error(`AUTH_ERROR: ${status} — session may be invalid or expired`);
      }
      if (attempt === MAX_RETRIES) {
        throw new Error(`GRAPHQL_POST_FAILED: ${status || err.message}`);
      }
      await new Promise(r => setTimeout(r, BASE_DELAY_MS));
    }
  }
}

// ─── Build GraphQL Headers ──────────────────────────────────────────────────

function buildGraphQLHeaders(sessionId, friendlyName, docId, rootFieldName) {
  const base = buildMobileHeaders(sessionId);
  return {
    ...base,
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-FB-Friendly-Name': friendlyName,
    'X-Client-Doc-Id': docId,
    'X-Root-Field-Name': rootFieldName,
    'X-FB-RMD': 'state=URL_ELIGIBLE',
  };
}

// ─── Build GraphQL Request Body ─────────────────────────────────────────────

function buildGraphQLBody(friendlyName, variables, docId) {
  const body = {
    method: 'post',
    pretty: 'false',
    format: 'json',
    server_timestamps: 'true',
    locale: 'user',
    purpose: 'fetch',
    fb_api_req_friendly_name: friendlyName,
    enable_canonical_naming: 'true',
    enable_canonical_variable_overrides: 'true',
    enable_canonical_naming_ambiguous_type_prefixing: 'true',
    variables: JSON.stringify(variables),
  };
  if (docId) body.client_doc_id = docId;
  return new URLSearchParams(body).toString();
}

// ─── Extract GraphQL Root Field ──────────────────────────────────────────────

function extractGraphQLRoot(data, rootFieldName) {
  const payload = data?.data || data;
  if (!payload || typeof payload !== 'object') return {};
  if (payload[rootFieldName]) return payload[rootFieldName];
  // fallback: find any key whose name contains the rootFieldName
  for (const key of Object.keys(payload)) {
    if (key.includes(rootFieldName) && payload[key] && typeof payload[key] === 'object') {
      return payload[key];
    }
  }
  return {};
}

// ─── GraphQL Fetch Followers (supports date_followed_latest/earliest) ───────

async function graphqlFetchFollowers(userId, sessionId, options = {}) {
  const { order, maxResults = DEFAULT_MAX_RESULTS, onProgress = () => {} } = options;
  const allUsers = [];
  const seenPks = new Set();
  let maxId = null;
  let hasMore = true;
  const rt = rankToken(userId);

  while (hasMore && allUsers.length < maxResults) {
    const variables = {
      user_id: String(userId),
      skip_suggested_users: true,
      skip_more_groups_available: true,
      skip_friendship_followers_fields: true,
      skip_page_size: true,
      skip_pending_admins: true,
      skip_has_more: true,
      skip_big_list: true,
      include_unseen_count: true,
      search_surface: 'follow_list_page',
      query: '',
      request_data: { rank_token: rt, enableGroups: true },
    };
    if (order) variables.order = order;
    if (maxId !== null) variables.max_id = maxId;

    const body = buildGraphQLBody('FollowersList', variables, GQL_FOLLOWERS_DOC_ID);
    const headers = buildGraphQLHeaders(sessionId, 'FollowersList', GQL_FOLLOWERS_DOC_ID, 'xdt_api__v1__friendships__followers');
    const json = await graphqlPost(GRAPHQL_QUERY_URL, body, headers);

    if (json.errors) {
      const errStr = JSON.stringify(json.errors);
      if (errStr.includes('login_required') || errStr.includes('401') || errStr.includes('403')) {
        throw new Error(`AUTH_ERROR: GraphQL auth failure — ${errStr.substring(0, 200)}`);
      }
      dbg('[graphql] errors:', json.errors);
      throw new Error(`GRAPHQL_ERROR: request failed`);
    }

    const followers = extractGraphQLRoot(json, 'xdt_api__v1__friendships__followers');
    if (!followers || !followers.users) break;
    if (followers.users.length === 0) break;  // empty page = stop pagination

    for (const u of followers.users) {
      if (allUsers.length >= maxResults) break;
      const pk = String(u.pk || u.id);  // normalize to string for consistent dedup
      if (seenPks.has(pk)) continue;
      seenPks.add(pk);
      allUsers.push({
        pk,
        username: u.username,
        full_name: u.full_name,
        is_private: u.is_private,
        is_verified: u.is_verified,
      });
    }

    hasMore = !!followers.next_max_id;
    maxId = followers.next_max_id || null;
    onProgress(allUsers.length);
    if (hasMore && allUsers.length < maxResults) await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
  }

  return allUsers;
}

// ─── GraphQL Fetch Following (supports date_followed_latest/earliest) ───────

async function graphqlFetchFollowing(userId, sessionId, options = {}) {
  const { order, maxResults = DEFAULT_MAX_RESULTS, onProgress = () => {} } = options;
  const allUsers = [];
  const seenPks = new Set();
  let maxId = null;
  let hasMore = true;
  const rt = rankToken(userId);

  while (hasMore && allUsers.length < maxResults) {
    const variables = {
      user_id: String(userId),
      skip_use_clickable_see_more: true,
      skip_preview_hashtags: true,
      skip_should_limit_list_of_followers: true,
      skip_pending_admins: true,
      skip_more_groups_available: true,
      skip_friendship_followers_fields: false,
      skip_page_size: true,
      skip_friend_requests: true,
      skip_big_list: true,
      skip_has_more: true,
      skip_suggested_users: true,
      skip_hashtag_count: true,
      include_unseen_count: true,
      include_profile_update_info: true,
      enable_groups: true,
      search_surface: 'follow_list_page',
      query: '',
      request_data: { search_surface: 'follow_list_page', rank_token: rt, includes_hashtags: true },
    };
    if (order) variables.order = order;
    if (maxId !== null) variables.max_id = maxId;

    const body = buildGraphQLBody('FollowingList', variables, GQL_FOLLOWING_DOC_ID);
    const headers = buildGraphQLHeaders(sessionId, 'FollowingList', GQL_FOLLOWING_DOC_ID, 'xdt_api__v1__friendships__following');
    const json = await graphqlPost(GRAPHQL_QUERY_URL, body, headers);

    if (json.errors) {
      const errStr = JSON.stringify(json.errors);
      if (errStr.includes('login_required') || errStr.includes('401') || errStr.includes('403')) {
        throw new Error(`AUTH_ERROR: GraphQL auth failure — ${errStr.substring(0, 200)}`);
      }
      dbg('[graphql] errors:', json.errors);
      throw new Error(`GRAPHQL_ERROR: request failed`);
    }

    const following = extractGraphQLRoot(json, 'xdt_api__v1__friendships__following');
    if (!following || !following.users) break;
    if (following.users.length === 0) break;  // empty page = stop pagination

    for (const u of following.users) {
      if (allUsers.length >= maxResults) break;
      const pk = String(u.pk || u.id);  // normalize to string for consistent dedup
      if (seenPks.has(pk)) continue;
      seenPks.add(pk);
      allUsers.push({
        pk,
        username: u.username,
        full_name: u.full_name,
        is_private: u.is_private,
        is_verified: u.is_verified,
      });
    }

    hasMore = !!following.next_max_id;
    maxId = following.next_max_id || null;
    onProgress(allUsers.length);
    if (hasMore && allUsers.length < maxResults) await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
  }

  return allUsers;
}

// ─── Fetch Followers ─────────────────────────────────────────────────────────

async function fetchFollowers(userId, sessionId, csrfToken, options = {}) {
  const order = options.order || 'date_followed_latest';
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  const onProgress = options.onProgress || (() => {});
  const allUsers = [];
  const seenPks = new Set();
  let maxId = null;
  let hasMore = true;

  while (hasMore && allUsers.length < maxResults) {
    const params = new URLSearchParams({
      count: '100',
      search_surface: 'follow_list_page',
      query: '',
      enable_groups: 'true',
      rank_token: rankToken(userId),
    });
    if (order) params.set('order', order);
    if (maxId) params.set('max_id', maxId);

    const url = `${IG_MOBILE_BASE}/api/v1/friendships/${userId}/followers/?${params}`;
    const headers = buildMobileHeaders(sessionId, csrfToken);
    const json = await mobileFetch(url, headers);

    if (json.users && Array.isArray(json.users)) {
      for (const u of json.users) {
        if (allUsers.length >= maxResults) break;
        const pk = String(u.pk || u.id);  // normalize to string for consistent dedup
        if (seenPks.has(pk)) continue;  // ← dedup by pk
        seenPks.add(pk);
        allUsers.push({
          pk,
          username: u.username,
          full_name: u.full_name,
          is_private: u.is_private,
          is_verified: u.is_verified,
        });
      }
    }

    hasMore = !!json.big_list && !!json.next_max_id;
    maxId = json.next_max_id || null;
    if (!maxId) hasMore = false;

    onProgress(allUsers.length);
    if (hasMore && allUsers.length < maxResults) await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
  }

  return allUsers;
}

// ─── Fetch Following ─────────────────────────────────────────────────────────

async function fetchFollowing(userId, sessionId, csrfToken, options = {}) {
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  const onProgress = options.onProgress || (() => {});
  const order = options.order || 'date_followed_latest';
  const allUsers = [];
  const seenPks = new Set();
  let maxId = null;
  let hasMore = true;

  while (hasMore && allUsers.length < maxResults) {
    const params = new URLSearchParams({
      count: '100',
      search_surface: 'follow_list_page',
      query: '',
      enable_groups: 'true',
      rank_token: rankToken(userId),
    });
    if (order) params.set('order', order);
    if (maxId) params.set('max_id', maxId);

    const url = `${IG_MOBILE_BASE}/api/v1/friendships/${userId}/following/?${params}`;
    const headers = buildMobileHeaders(sessionId, csrfToken);
    const json = await mobileFetch(url, headers);

    if (json.users && Array.isArray(json.users)) {
      for (const u of json.users) {
        if (allUsers.length >= maxResults) break;
        const pk = String(u.pk || u.id);  // normalize to string for consistent dedup
        if (seenPks.has(pk)) continue;  // ← dedup by pk
        seenPks.add(pk);
        allUsers.push({
          pk,
          username: u.username,
          full_name: u.full_name,
          is_private: u.is_private,
          is_verified: u.is_verified,
        });
      }
    }

    hasMore = !!json.big_list && !!json.next_max_id;
    maxId = json.next_max_id || null;
    if (!maxId) hasMore = false;

    onProgress(allUsers.length);
    if (hasMore && allUsers.length < maxResults) await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
  }

  return allUsers;
}

module.exports = {
  fetchFollowers,
  fetchFollowing,
  graphqlFetchFollowers,
  graphqlFetchFollowing,
  buildMobileHeaders,
  buildGraphQLHeaders,
  buildGraphQLBody,
  generateDeviceIds,
  rankToken,
  mobileFetch,
  graphqlPost,
  DEFAULT_MAX_RESULTS,
};

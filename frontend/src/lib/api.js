const BASE_URL = ''

function getToken() {
  return localStorage.getItem('bosun_token')
}

function getHeaders(extra = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...extra
  }
  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

async function handleResponse(res) {
  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}`
    try {
      const data = await res.json()
      errorMsg = data.error || data.message || errorMsg
    } catch {}
    const err = new Error(errorMsg)
    err.status = res.status
    throw err
  }
  const contentType = res.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    return res.json()
  }
  return res.text()
}

export async function get(path, opts = {}) {
  const res = await fetch(BASE_URL + path, {
    method: 'GET',
    headers: getHeaders(opts.headers),
    signal: opts.signal
  })
  return handleResponse(res)
}

export async function post(path, body, opts = {}) {
  const res = await fetch(BASE_URL + path, {
    method: 'POST',
    headers: getHeaders(opts.headers),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: opts.signal
  })
  return handleResponse(res)
}

export async function put(path, body, opts = {}) {
  const res = await fetch(BASE_URL + path, {
    method: 'PUT',
    headers: getHeaders(opts.headers),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: opts.signal
  })
  return handleResponse(res)
}

export async function del(path, opts = {}) {
  const res = await fetch(BASE_URL + path, {
    method: 'DELETE',
    headers: getHeaders(opts.headers),
    signal: opts.signal
  })
  return handleResponse(res)
}

# TestNet General API Information | Binance Open Platform

# General API Information

-   The base endpoint is: **`wss://ws-api.testnet.binance.vision/ws-api/v3`**
    -   If you experience issues with the standard 443 port, alternative port 9443 is also available.
-   A single connection to the API is only valid for 24 hours; expect to be disconnected after the 24-hour mark.
-   We support HMAC, RSA, and Ed25519 keys. For more information, please see [API Key types](/docs/binance-spot-api-docs/faqs/api_key_types).
-   Responses are in JSON by default. To receive responses in SBE, refer to the [SBE FAQ](/docs/binance-spot-api-docs/faqs/sbe_faq) page.
-   The WebSocket server will send a `ping frame` every 20 seconds.
    -   If the WebSocket server does not receive a `pong frame` back from the connection within a minute the connection will be disconnected.
    -   When you receive a ping, you must send a pong with a copy of ping's payload as soon as possible.
    -   Unsolicited `pong frames` are allowed, but will not prevent disconnection. **It is recommended that the payload for these pong frames are empty.**
-   Data is returned in **chronological order**, unless noted otherwise.
    -   Without `startTime` or `endTime`, returns the most recent items up to the limit.
    -   With `startTime`, returns oldest items from `startTime` up to the limit.
    -   With `endTime`, returns most recent items up to `endTime` and the limit.
    -   With both, behaves like `startTime` but does not exceed `endTime`.
-   All timestamps in the JSON responses are in **milliseconds in UTC by default**. To receive the information in microseconds, please add the parameter `timeUnit=MICROSECOND` or `timeUnit=microsecond` in the URL.
-   Timestamp parameters (e.g. `startTime`, `endTime`, `timestamp`) can be passed in milliseconds or microseconds.
-   All field names and values are **case-sensitive**, unless noted otherwise.
-   If there are enums or terms you want clarification on, please see [SPOT Glossary](/docs/binance-spot-api-docs/faqs/spot_glossary) for more information.
-   APIs have a timeout of 10 seconds when processing a request. If a response from the Matching Engine takes longer than this, the API responds with "Timeout waiting for response from backend server. Send status unknown; execution status unknown." [(-1007 TIMEOUT)](/docs/binance-spot-api-docs/testnet/errors#-1007-timeout)
    -   This does not always mean that the request failed in the Matching Engine.
    -   If the status of the request has not appeared in [User Data Stream](/docs/binance-spot-api-docs/testnet/user-data-stream), please perform an API query for its status.
	
	
# Request format | Binance Open Platform

# Request format

Requests must be sent as JSON in **text frames**, one request per frame.

Example of request:

```
{  "id": "e2a85d9f-07a5-4f94-8d5f-789dc3deb097",  "method": "order.place",  "params": {    "symbol": "BTCUSDT",    "side": "BUY",    "type": "LIMIT",    "price": "0.1",    "quantity": "10",    "timeInForce": "GTC",    "timestamp": 1655716096498,    "apiKey": "T59MTDLWlpRW16JVeZ2Nju5A5C98WkMm8CSzWC4oqynUlTm1zXOxyauT8LmwXEv9",    "signature": "5942ad337e6779f2f4c62cd1c26dba71c91514400a24990a3e7f5edec9323f90"  }}
```

Request fields:

Name

Type

Mandatory

Description

`id`

INT / STRING / `null`

YES

Arbitrary ID used to match responses to requests

`method`

STRING

YES

Request method name

`params`

OBJECT

NO

Request parameters. May be omitted if there are no parameters

-   Request `id` is truly arbitrary. You can use UUIDs, sequential IDs, current timestamp, etc. The server does not interpret `id` in any way, simply echoing it back in the response.
    
    You can freely reuse IDs within a session. However, be careful to not send more than one request at a time with the same ID, since otherwise it might be impossible to tell the responses apart.
    
-   Request method names may be prefixed with explicit version: e.g., `"v3/order.place"`.
    
-   The order of `params` is not significant.


# Response format | Binance Open Platform

On this page

# Response format

Responses are returned as JSON in **text frames**, one response per frame.

Example of successful response:

```
{  "id": "e2a85d9f-07a5-4f94-8d5f-789dc3deb097",  "status": 200,  "result": {    "symbol": "BTCUSDT",    "orderId": 12510053279,    "orderListId": -1,    "clientOrderId": "a097fe6304b20a7e4fc436",    "transactTime": 1655716096505,    "price": "0.10000000",    "origQty": "10.00000000",    "executedQty": "0.00000000",    "origQuoteOrderQty": "0.000000",    "cummulativeQuoteQty": "0.00000000",    "status": "NEW",    "timeInForce": "GTC",    "type": "LIMIT",    "side": "BUY",    "workingTime": 1655716096505,    "selfTradePreventionMode": "NONE"  },  "rateLimits": [    {      "rateLimitType": "ORDERS",      "interval": "SECOND",      "intervalNum": 10,      "limit": 50,      "count": 12    },    {      "rateLimitType": "ORDERS",      "interval": "DAY",      "intervalNum": 1,      "limit": 160000,      "count": 4043    },    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 321    }  ]}
```

Example of failed response:

```
{  "id": "e2a85d9f-07a5-4f94-8d5f-789dc3deb097",  "status": 400,  "error": {    "code": -2010,    "msg": "Account has insufficient balance for requested action."  },  "rateLimits": [    {      "rateLimitType": "ORDERS",      "interval": "SECOND",      "intervalNum": 10,      "limit": 50,      "count": 13    },    {      "rateLimitType": "ORDERS",      "interval": "DAY",      "intervalNum": 1,      "limit": 160000,      "count": 4044    },    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 322    }  ]}
```

Response fields:

Name

Type

Mandatory

Description

`id`

INT / STRING / `null`

YES

Same as in the original request

`status`

INT

YES

Response status. See [Status codes](/docs/binance-spot-api-docs/testnet/websocket-api/response-format#status-codes)

`result`

OBJECT / ARRAY

YES

Response content. Present if request succeeded

`error`

OBJECT

Error description. Present if request failed

`rateLimits`

ARRAY

NO

Rate limiting status. See [Rate limits](/docs/binance-spot-api-docs/testnet/websocket-api/response-format#rate-limits)

### Status codes[​](/docs/binance-spot-api-docs/testnet/websocket-api/response-format#status-codes "Direct link to Status codes")

Status codes in the `status` field are the same as in HTTP.

Here are some common status codes that you might encounter:

-   `200` indicates a successful response.
-   `4XX` status codes indicate invalid requests; the issue is on your side.
    -   `400` – your request failed, see `error` for the reason.
    -   `403` – you have been blocked by the Web Application Firewall.
    -   `409` – your request partially failed but also partially succeeded, see `error` for details.
    -   `418` – you have been auto-banned for repeated violation of rate limits.
    -   `429` – you have exceeded API request rate limit, please slow down.
-   `5XX` status codes indicate internal errors; the issue is on Binance's side.
    -   **Important:** If a response contains 5xx status code, it **does not** necessarily mean that your request has failed. Execution status is _unknown_ and the request might have actually succeeded. Please use query methods to confirm the status. You might also want to establish a new WebSocket connection for that.

See [Error codes for Binance](/docs/binance-spot-api-docs/testnet/errors) for a list of error codes and messages.

-   [Status codes](/docs/binance-spot-api-docs/testnet/websocket-api/response-format#status-codes)


# Event format | Binance Open Platform

# Event format

[User Data Stream](/docs/binance-spot-api-docs/testnet/user-data-stream) events for non-SBE sessions are sent as JSON in **text frames**, one event per frame.

Events in [SBE sessions](/docs/binance-spot-api-docs/faqs/sbe_faq) will be sent as **binary frames**.

Please refer to [`userDataStream.subscribe`](/docs/binance-spot-api-docs/testnet/websocket-api/user-data-stream-requests#user-data-stream-subscribe) for details on how to subscribe to User Data Stream in WebSocket API.

Example of an event:

```
{  "subscriptionId": 0,  "event": {    "e": "outboundAccountPosition",    "E": 1728972148778,    "u": 1728972148778,    "B": [      {        "a": "BTC",        "f": "11818.00000000",        "l": "182.00000000"      },      {        "a": "USDT",        "f": "10580.00000000",        "l": "70.00000000"      }    ]  }}
```

Event fields:

Name

Type

Mandatory

Description

`event`

OBJECT

YES

Event payload. See [User Data Streams](/docs/binance-spot-api-docs/testnet/user-data-stream)

`subscriptionId`

INT

NO

Identifies which subscription the event is coming from. See [User Data Stream subscriptions](/docs/binance-spot-api-docs/testnet/websocket-api/event-format#general_info_user_data_stream_subscriptions)


# Rate limits | Binance Open Platform

On this page

# Rate limits

### Connection limits[​](/docs/binance-spot-api-docs/testnet/websocket-api/rate-limits#connection-limits "Direct link to Connection limits")

There is a limit of **300 connections per attempt every 5 minutes**.

The connection is per **IP address**.

### General information on rate limits[​](/docs/binance-spot-api-docs/testnet/websocket-api/rate-limits#general-information-on-rate-limits "Direct link to General information on rate limits")

-   Current API rate limits can be queried using the [`exchangeInfo`](/docs/binance-spot-api-docs/testnet/websocket-api/rate-limits#exchange-information) request.
-   There are multiple rate limit types across multiple intervals.
-   Responses can indicate current rate limit status in the optional `rateLimits` field.
-   Requests fail with status `429` when unfilled order count or request rate limits are violated.

#### How to interpret rate limits[​](/docs/binance-spot-api-docs/testnet/websocket-api/rate-limits#how-to-interpret-rate-limits "Direct link to How to interpret rate limits")

A response with rate limit status may look like this:

```
{  "id": "7069b743-f477-4ae3-81db-db9b8df085d2",  "status": 200,  "result": {    "serverTime": 1656400526260  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 70    }  ]}
```

The `rateLimits` array describes all currently active rate limits affected by the request.

Name

Type

Mandatory

Description

`rateLimitType`

ENUM

YES

Rate limit type: `REQUEST_WEIGHT`, `ORDERS`

`interval`

ENUM

YES

Rate limit interval: `SECOND`, `MINUTE`, `HOUR`, `DAY`

`intervalNum`

INT

YES

Rate limit interval multiplier

`limit`

INT

YES

Request limit per interval

`count`

INT

YES

Current usage per interval

Rate limits are accounted by intervals.

For example, a `1 MINUTE` interval starts every minute. Request submitted at 00:01:23.456 counts towards the 00:01:00 minute's limit. Once the 00:02:00 minute starts, the count will reset to zero again.

Other intervals behave in a similar manner. For example, `1 DAY` rate limit resets at 00:00 UTC every day, and `10 SECOND` interval resets at 00, 10, 20... seconds of each minute.

APIs have multiple rate-limiting intervals. If you exhaust a shorter interval but the longer interval still allows requests, you will have to wait for the shorter interval to expire and reset. If you exhaust a longer interval, you will have to wait for that interval to reset, even if shorter rate limit count is zero.

#### How to show/hide rate limit information[​](/docs/binance-spot-api-docs/testnet/websocket-api/rate-limits#how-to-showhide-rate-limit-information "Direct link to How to show/hide rate limit information")

`rateLimits` field is included with every response by default.

However, rate limit information can be quite bulky. If you are not interested in detailed rate limit status of every request, the `rateLimits` field can be omitted from responses to reduce their size.

-   Optional `returnRateLimits` boolean parameter in request.
    
    Use `returnRateLimits` parameter to control whether to include `rateLimits` fields in response to individual requests.
    
    Default request and response:
    
    ```
    {"id":1,"method":"time"}
    ```
    
    ```
    {"id":1,"status":200,"result":{"serverTime":1656400526260},"rateLimits":[{"rateLimitType":"REQUEST_WEIGHT","interval":"MINUTE","intervalNum":1,"limit":6000,"count":70}]}
    ```
    
    Request and response without rate limit status:
    
    ```
    {"id":2,"method":"time","params":{"returnRateLimits":false}}
    ```
    
    ```
    {"id":2,"status":200,"result":{"serverTime":1656400527891}}
    ```
    
-   Optional `returnRateLimits` boolean parameter in connection URL.
    
    If you wish to omit `rateLimits` from all responses by default, use `returnRateLimits` parameter in the query string instead:
    
    ```
    wss://ws-api.binance.com:443/ws-api/v3?returnRateLimits=false
    ```
    
    This will make all requests made through this connection behave as if you have passed `"returnRateLimits": false`.
    
    If you _want_ to see rate limits for a particular request, you need to explicitly pass the `"returnRateLimits": true` parameter.
    

**Note:** Your requests are still rate limited if you hide the `rateLimits` field in responses.

### IP limits[​](/docs/binance-spot-api-docs/testnet/websocket-api/rate-limits#ip-limits "Direct link to IP limits")

-   Every request has a certain **weight**, added to your limit as you perform requests.
    -   The heavier the request (e.g. querying data from multiple symbols), the more weight the request will cost.
    -   Connecting to WebSocket API costs 2 weight.
-   Current weight usage is indicated by the `REQUEST_WEIGHT` rate limit type.
-   Use the [`exchangeInfo`](/docs/binance-spot-api-docs/testnet/websocket-api/rate-limits#exchange-information) request to keep track of the current weight limits.
-   Weight is accumulated **per IP address** and is shared by all connections from that address.
-   If you go over the weight limit, requests fail with status `429`.
    -   This status code indicates you should back off and stop spamming the API.
    -   Rate-limited responses include a `retryAfter` field, indicating when you can retry the request.
-   **Repeatedly violating rate limits and/or failing to back off after receiving 429s will result in an automated IP ban and you will be disconnected.**
    -   Requests from a banned IP address fail with status `418`.
    -   `retryAfter` field indicates the timestamp when the ban will be lifted.
-   IP bans are tracked and **scale in duration** for repeat offenders, **from 2 minutes to 3 days**.

Successful response indicating that in 1 minute you have used 70 weight out of your 6000 limit:

```
{  "id": "7069b743-f477-4ae3-81db-db9b8df085d2",  "status": 200,  "result": [],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 70    }  ]}
```

Failed response indicating that you are banned and the ban will last until epoch `1659146400000`:

```
{  "id": "fc93a61a-a192-4cf4-bb2a-a8f0f0c51e06",  "status": 418,  "error": {    "code": -1003,    "msg": "Way too much request weight used; IP banned until 1659146400000. Please use WebSocket Streams for live updates to avoid bans.",    "data": {      "serverTime": 1659142907531,      "retryAfter": 1659146400000    }  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 2411    }  ]}
```

### Unfilled Order Count[​](/docs/binance-spot-api-docs/testnet/websocket-api/rate-limits#unfilled-order-count "Direct link to Unfilled Order Count")

-   Successfully placed orders update the `ORDERS` rate limit type.
-   Rejected or unsuccessful orders might or might not update the `ORDERS` rate limit type.
-   **Please note that if your orders are consistently filled by trades, you can continuously place orders on the API**. For more information, please see [Spot Unfilled Order Count Rules](/docs/binance-spot-api-docs/faqs/order_count_decrement).
-   Use the [`account.rateLimits.orders`](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#query-unfilled-order-count) request to keep track of how many orders you have placed within this interval.
-   If you exceed this, requests fail with status `429`.
    -   This status code indicates you should back off and stop spamming the API.
    -   Responses that have a status `429` include a `retryAfter` field, indicating when you can retry the request.
-   This is maintained **per account** and is shared by all API keys of the account.

Successful response indicating that you have placed 12 orders in 10 seconds, and 4043 orders in the past 24 hours:

```
{  "id": "e2a85d9f-07a5-4f94-8d5f-789dc3deb097",  "status": 200,  "result": {    "symbol": "BTCUSDT",    "orderId": 12510053279,    "orderListId": -1,    "clientOrderId": "a097fe6304b20a7e4fc436",    "transactTime": 1655716096505,    "price": "0.10000000",    "origQty": "10.00000000",    "executedQty": "0.00000000",    "origQuoteOrderQty": "0.000000",    "cummulativeQuoteQty": "0.00000000",    "status": "NEW",    "timeInForce": "GTC",    "type": "LIMIT",    "side": "BUY",    "workingTime": 1655716096505,    "selfTradePreventionMode": "NONE"  },  "rateLimits": [    {      "rateLimitType": "ORDERS",      "interval": "SECOND",      "intervalNum": 10,      "limit": 50,      "count": 12    },    {      "rateLimitType": "ORDERS",      "interval": "DAY",      "intervalNum": 1,      "limit": 160000,      "count": 4043    },    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 321    }  ]}
```

-   [Connection limits](/docs/binance-spot-api-docs/testnet/websocket-api/rate-limits#connection-limits)
-   [General information on rate limits](/docs/binance-spot-api-docs/testnet/websocket-api/rate-limits#general-information-on-rate-limits)
-   [IP limits](/docs/binance-spot-api-docs/testnet/websocket-api/rate-limits#ip-limits)
-   [Unfilled Order Count](/docs/binance-spot-api-docs/testnet/websocket-api/rate-limits#unfilled-order-count)


# Request security | Binance Open Platform

On this page

# Request security

-   Each method has a security type indicating required API key permissions, shown next to the method name (e.g., [Place new order (TRADE)](/docs/binance-spot-api-docs/testnet/websocket-api/request-security#place-new-order-trade)).
-   If unspecified, the security type is `NONE`.
-   Except for `NONE`, all methods with a security type are considered `SIGNED` requests (i.e. including a `signature`), except for [listenKey management](/docs/binance-spot-api-docs/testnet/websocket-api/request-security#user-data-stream-requests).
-   Secure methods require a valid API key to be specified and authenticated.
    -   API keys can be created on the [SPOT Test Network](https://testnet.binance.vision) upon logging in with your Github account.
    -   **Both API key and secret key are sensitive.** Never share them with anyone. If you notice unusual activity in your account, immediately revoke all the keys and contact Binance support.
-   API keys can be configured to allow access only to certain types of secure methods.
    -   For example, you can have an API key with `TRADE` permission for trading, while using a separate API key with `USER_DATA` permission to monitor your order status.
    -   By default, an API key cannot `TRADE`. You need to enable trading in API Management first.

Security type

Description

`NONE`

Public market data

`TRADE`

Trading on the exchange, placing and canceling orders

`USER_DATA`

Private account information, such as order status and your trading history

`USER_STREAM`

Managing User Data Stream subscriptions

### SIGNED request security[​](/docs/binance-spot-api-docs/testnet/websocket-api/request-security#signed-request-security "Direct link to SIGNED request security")

-   `SIGNED` requests require an additional parameter: `signature`, authorizing the request.
-   Please consult [SIGNED request example (HMAC)](/docs/binance-spot-api-docs/testnet/websocket-api/request-security#signed-request-example-hmac), [SIGNED request example (RSA)](/docs/binance-spot-api-docs/testnet/websocket-api/request-security#signed-request-example-rsa), and [SIGNED request example (Ed25519)](/docs/binance-spot-api-docs/testnet/websocket-api/request-security#signed-request-example-ed25519) on how to compute signature, depending on which API key type you are using.

### Timing security[​](/docs/binance-spot-api-docs/testnet/websocket-api/request-security#timing-security "Direct link to Timing security")

-   `SIGNED` requests also require a `timestamp` parameter which should be the current timestamp either in milliseconds or microseconds. (See [General API Information](/docs/binance-spot-api-docs/testnet/websocket-api/request-security#general-api-information))
-   An additional optional parameter, `recvWindow`, specifies for how long the request stays valid and may only be specified in milliseconds.
    -   `recvWindow` supports up to three decimal places of precision (e.g., 6000.346) so that microseconds may be specified.
    -   If `recvWindow` is not sent, **it defaults to 5000 milliseconds**.
    -   Maximum `recvWindow` is 60000 milliseconds.
-   Request processing logic is as follows:

```
serverTime = getCurrentTime()if (timestamp < (serverTime + 1 second) && (serverTime - timestamp) <= recvWindow) {  // begin processing request  serverTime = getCurrentTime()  if (serverTime - timestamp) <= recvWindow {    // forward request to Matching Engine  } else {    // reject request  }  // finish processing request} else {  // reject request}
```

**Serious trading is about timing.** Networks can be unstable and unreliable, which can lead to requests taking varying amounts of time to reach the servers. With `recvWindow`, you can specify that the request must be processed within a certain number of milliseconds or be rejected by the server.

**It is recommended to use a small `recvWindow` of 5000 or less!**

### SIGNED request example (HMAC)[​](/docs/binance-spot-api-docs/testnet/websocket-api/request-security#signed-request-example-hmac "Direct link to SIGNED request example (HMAC)")

Here is a step-by-step guide on how to sign requests using HMAC secret key.

Example API key and secret key:

Key

Value

apiKey

`vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A`

secretKey

`NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j`

**WARNING: DO NOT SHARE YOUR API KEY AND SECRET KEY WITH ANYONE.**

The example keys are provided here only for illustrative purposes.

Example of request:

```
{  "id": "4885f793-e5ad-4c3b-8f6c-55d891472b71",  "method": "order.place",  "params": {    "symbol":           "BTCUSDT",    "side":             "SELL",    "type":             "LIMIT",    "timeInForce":      "GTC",    "quantity":         "0.01000000",    "price":            "52000.00",    "newOrderRespType": "ACK",    "recvWindow":       100,    "timestamp":        1645423376532,    "apiKey":           "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "signature":        "------ FILL ME ------"  }}
```

As you can see, the `signature` parameter is currently missing.

**Step 1. Construct the signature payload**

Take all request `params` except for the `signature`, sort them by name in alphabetical order:

Parameter

Value

apiKey

vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A

newOrderRespType

ACK

price

52000.00

quantity

0.01000000

recvWindow

100

side

SELL

symbol

BTCUSDT

timeInForce

GTC

timestamp

1645423376532

type

LIMIT

Format parameters as `parameter=value` pairs separated by `&`.

Resulting signature payload:

```
apiKey=vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A&newOrderRespType=ACK&price=52000.00&quantity=0.01000000&recvWindow=100&side=SELL&symbol=BTCUSDT&timeInForce=GTC&timestamp=1645423376532&type=LIMIT
```

**Step 2. Compute the signature**

1.  Interpret `secretKey` as ASCII data, using it as a key for HMAC-SHA-256.
2.  Sign signature payload as ASCII data.
3.  Encode HMAC-SHA-256 output as a hex string.

Note that `apiKey`, `secretKey`, and the payload are **case-sensitive**, while resulting signature value is case-insensitive.

You can cross-check your signature algorithm implementation with OpenSSL:

```
$ echo -n 'apiKey=vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A&newOrderRespType=ACK&price=52000.00&quantity=0.01000000&recvWindow=100&side=SELL&symbol=BTCUSDT&timeInForce=GTC&timestamp=1645423376532&type=LIMIT' \  | openssl dgst -hex -sha256 -hmac 'NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j'cc15477742bd704c29492d96c7ead9414dfd8e0ec4a00f947bb5bb454ddbd08a
```

**Step 3. Add `signature` to request `params`**

Finally, complete the request by adding the `signature` parameter with the signature string.

```
{  "id": "4885f793-e5ad-4c3b-8f6c-55d891472b71",  "method": "order.place",  "params": {    "symbol":           "BTCUSDT",    "side":             "SELL",    "type":             "LIMIT",    "timeInForce":      "GTC",    "quantity":         "0.01000000",    "price":            "52000.00",    "newOrderRespType": "ACK",    "recvWindow":       100,    "timestamp":        1645423376532,    "apiKey":           "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "signature":        "cc15477742bd704c29492d96c7ead9414dfd8e0ec4a00f947bb5bb454ddbd08a"  }}
```

### SIGNED request example (RSA)[​](/docs/binance-spot-api-docs/testnet/websocket-api/request-security#signed-request-example-rsa "Direct link to SIGNED request example (RSA)")

Here is a step-by-step guide on how to sign requests using your RSA private key.

Key

Value

apiKey

`CAvIjXy3F44yW6Pou5k8Dy1swsYDWJZLeoK2r8G4cFDnE9nosRppc2eKc1T8TRTQ`

In this example, we assume the private key is stored in the `test-prv-key.pem` file.

**WARNING: DO NOT SHARE YOUR API KEY AND PRIVATE KEY WITH ANYONE.**

The example keys are provided here only for illustrative purposes.

Example of request:

```
{  "id": "4885f793-e5ad-4c3b-8f6c-55d891472b71",  "method": "order.place",  "params": {    "symbol":           "BTCUSDT",    "side":             "SELL",    "type":             "LIMIT",    "timeInForce":      "GTC",    "quantity":         "0.01000000",    "price":            "52000.00",    "newOrderRespType": "ACK",    "recvWindow":       100,    "timestamp":        1645423376532,    "apiKey":           "CAvIjXy3F44yW6Pou5k8Dy1swsYDWJZLeoK2r8G4cFDnE9nosRppc2eKc1T8TRTQ",    "signature":        "------ FILL ME ------"  }}
```

**Step 1. Construct the signature payload**

Take all request `params` except for the `signature`, sort them by name in alphabetical order:

Parameter

Value

apiKey

CAvIjXy3F44yW6Pou5k8Dy1swsYDWJZLeoK2r8G4cFDnE9nosRppc2eKc1T8TRTQ

newOrderRespType

ACK

price

52000.00

quantity

0.01000000

recvWindow

100

side

SELL

symbol

BTCUSDT

timeInForce

GTC

timestamp

1645423376532

type

LIMIT

Format parameters as `parameter=value` pairs separated by `&`.

Resulting signature payload:

```
apiKey=CAvIjXy3F44yW6Pou5k8Dy1swsYDWJZLeoK2r8G4cFDnE9nosRppc2eKc1T8TRTQ&newOrderRespType=ACK&price=52000.00&quantity=0.01000000&recvWindow=100&side=SELL&symbol=BTCUSDT&timeInForce=GTC&timestamp=1645423376532&type=LIMIT
```

**Step 2. Compute the signature**

1.  Encode signature payload as ASCII data.
2.  Sign payload using RSASSA-PKCS1-v1\_5 algorithm with SHA-256 hash function.
3.  Encode output as base64 string.

Note that `apiKey`, the payload, and the resulting `signature` are **case-sensitive**.

You can cross-check your signature algorithm implementation with OpenSSL:

```
$ echo -n 'apiKey=CAvIjXy3F44yW6Pou5k8Dy1swsYDWJZLeoK2r8G4cFDnE9nosRppc2eKc1T8TRTQ&newOrderRespType=ACK&price=52000.00&quantity=0.01000000&recvWindow=100&side=SELL&symbol=BTCUSDT&timeInForce=GTC&timestamp=1645423376532&type=LIMIT' \  | openssl dgst -sha256 -sign test-prv-key.pem \  | openssl enc -base64 -AOJJaf8C/3VGrU4ATTR4GiUDqL2FboSE1Qw7UnnoYNfXTXHubIl1iaePGuGyfct4NPu5oVEZCH4Q6ZStfB1w4ssgu0uiB/Bg+fBrRFfVgVaLKBdYHMvT+ljUJzqVaeoThG9oXlduiw8PbS9U8DYAbDvWN3jqZLo4Z2YJbyovyDAvDTr/oC0+vssLqP7NmlNb3fF3Bj7StmOwJvQJTbRAtzxK5PP7OQe+0mbW+D7RqVkUiSswR8qJFWTeSe4nXXNIdZdueYhF/Xf25L+KitJS5IHdIHcKfEw3MQzHFb2ZsGWkjDQwxkwr7Noi0Zaa+gFtxCuatGFm9dFIyx217pmSHtA==
```

**Step 3. Add `signature` to request `params`**

Finally, complete the request by adding the `signature` parameter with the signature string.

```
{  "id": "4885f793-e5ad-4c3b-8f6c-55d891472b71",  "method": "order.place",  "params": {    "symbol":           "BTCUSDT",    "side":             "SELL",    "type":             "LIMIT",    "timeInForce":      "GTC",    "quantity":         "0.01000000",    "price":            "52000.00",    "newOrderRespType": "ACK",    "recvWindow":       100,    "timestamp":        1645423376532,    "apiKey":           "CAvIjXy3F44yW6Pou5k8Dy1swsYDWJZLeoK2r8G4cFDnE9nosRppc2eKc1T8TRTQ",    "signature":        "OJJaf8C/3VGrU4ATTR4GiUDqL2FboSE1Qw7UnnoYNfXTXHubIl1iaePGuGyfct4NPu5oVEZCH4Q6ZStfB1w4ssgu0uiB/Bg+fBrRFfVgVaLKBdYHMvT+ljUJzqVaeoThG9oXlduiw8PbS9U8DYAbDvWN3jqZLo4Z2YJbyovyDAvDTr/oC0+vssLqP7NmlNb3fF3Bj7StmOwJvQJTbRAtzxK5PP7OQe+0mbW+D7RqVkUiSswR8qJFWTeSe4nXXNIdZdueYhF/Xf25L+KitJS5IHdIHcKfEw3MQzHFb2ZsGWkjDQwxkwr7Noi0Zaa+gFtxCuatGFm9dFIyx217pmSHtA=="  }}
```

### SIGNED Request Example (Ed25519)[​](/docs/binance-spot-api-docs/testnet/websocket-api/request-security#signed-request-example-ed25519 "Direct link to SIGNED Request Example (Ed25519)")

**Note: It is highly recommended to use Ed25519 API keys as it should provide the best performance and security out of all supported key types.**

Parameter

Value

`symbol`

BTCUSDT

`side`

SELL

`type`

LIMIT

`timeInForce`

GTC

`quantity`

1

`price`

0.2

`timestamp`

1668481559918

This is a sample code in Python to show how to sign the payload with an Ed25519 key.

```
#!/usr/bin/env python3import base64import timeimport jsonfrom cryptography.hazmat.primitives.serialization import load_pem_private_keyfrom websocket import create_connection# Set up authenticationAPI_KEY='put your own API Key here'PRIVATE_KEY_PATH='test-prv-key.pem'# Load the private key.# In this example the key is expected to be stored without encryption,# but we recommend using a strong password for improved security.with open(PRIVATE_KEY_PATH, 'rb') as f:    private_key = load_pem_private_key(data=f.read(),                                       password=None)# Set up the request parametersparams = {    'apiKey':        API_KEY,    'symbol':       'BTCUSDT',    'side':         'SELL',    'type':         'LIMIT',    'timeInForce':  'GTC',    'quantity':     '1.0000000',    'price':        '0.20'}# Timestamp the requesttimestamp = int(time.time() * 1000) # UNIX timestamp in millisecondsparams['timestamp'] = timestamp# Sign the requestpayload = '&'.join([f'{param}={value}' for param, value in sorted(params.items())])signature = base64.b64encode(private_key.sign(payload.encode('ASCII')))params['signature'] = signature.decode('ASCII')# Send the requestrequest = {    'id': 'my_new_order',    'method': 'order.place',    'params': params}ws = create_connection("wss://ws-api.binance.com:443/ws-api/v3")ws.send(json.dumps(request))result =  ws.recv()ws.close()print(result)
```

-   [SIGNED request security](/docs/binance-spot-api-docs/testnet/websocket-api/request-security#signed-request-security)
-   [Timing security](/docs/binance-spot-api-docs/testnet/websocket-api/request-security#timing-security)
-   [SIGNED request example (HMAC)](/docs/binance-spot-api-docs/testnet/websocket-api/request-security#signed-request-example-hmac)
-   [SIGNED request example (RSA)](/docs/binance-spot-api-docs/testnet/websocket-api/request-security#signed-request-example-rsa)
-   [SIGNED Request Example (Ed25519)](/docs/binance-spot-api-docs/testnet/websocket-api/request-security#signed-request-example-ed25519)


# Session Authentication | Binance Open Platform

On this page

# Session Authentication

**Note:** Only _Ed25519_ keys are supported for this feature.

If you do not want to specify `apiKey` and `signature` in each individual request, you can authenticate your API key for the active WebSocket session.

Once authenticated, you no longer have to specify `apiKey` and `signature` for those requests that need them. Requests will be performed on behalf of the account owning the authenticated API key.

**Note:** You still have to specify the `timestamp` parameter for `SIGNED` requests.

### Authenticate after connection[​](/docs/binance-spot-api-docs/testnet/websocket-api/session-authentication#authenticate-after-connection "Direct link to Authenticate after connection")

You can authenticate an already established connection using session authentication requests:

-   [`session.logon`](/docs/binance-spot-api-docs/testnet/websocket-api/session-authentication#log-in-with-api-key-signed) – authenticate, or change the API key associated with the connection
-   [`session.status`](/docs/binance-spot-api-docs/testnet/websocket-api/session-authentication#query-session-status) – check connection status and the current API key
-   [`session.logout`](/docs/binance-spot-api-docs/testnet/websocket-api/session-authentication#log-out-of-the-session) – forget the API key associated with the connection

**Regarding API key revocation:**

If during an active session the API key becomes invalid for _any reason_ (e.g. IP address is not whitelisted, API key was deleted, API key doesn't have correct permissions, etc), after the next request the session will be revoked with the following error message:

```
{  "id": null,  "status": 401,  "error": {    "code": -2015,    "msg": "Invalid API-key, IP, or permissions for action."  }}
```

### Authorize _ad hoc_ requests[​](/docs/binance-spot-api-docs/testnet/websocket-api/session-authentication#authorize-ad-hoc-requests "Direct link to authorize-ad-hoc-requests")

Only one API key can be authenticated with the WebSocket connection. The authenticated API key is used by default for requests that require an `apiKey` parameter. However, you can always specify the `apiKey` and `signature` explicitly for individual requests, overriding the authenticated API key and using a different one to authorize a specific request.

For example, you might want to authenticate your `USER_DATA` key to be used by default, but specify the `TRADE` key with an explicit signature when placing orders.

-   [Authenticate after connection](/docs/binance-spot-api-docs/testnet/websocket-api/session-authentication#authenticate-after-connection)
-   [Authorize _ad hoc_ requests](/docs/binance-spot-api-docs/testnet/websocket-api/session-authentication#authorize-ad-hoc-requests)


# Data sources | Binance Open Platform

# Data sources

-   The API system is asynchronous. Some delay in the response is normal and expected.
    
-   Each method has a data source indicating where the data is coming from, and thus how up-to-date it is.
    

Data Source

Latency

Description

Matching Engine

lowest

The Matching Engine produces the response directly

Memory

low

Data is fetched from API server's local or external memory cache

Database

moderate

Data is retrieved from the database

-   Some methods have more than one data source (e.g., Memory => Database).
    
    This means that the API will look for the latest data in that order: first in the cache, then in the database.
	
# General requests | Binance Open Platform

On this page

# General requests

### Test connectivity[​](/docs/binance-spot-api-docs/testnet/websocket-api/general-requests#test-connectivity "Direct link to Test connectivity")

```
{  "id": "922bcc6e-9de8-440d-9e84-7c80933a8d0d",  "method": "ping"}
```

Test connectivity to the WebSocket API.

**Note:** You can use regular WebSocket ping frames to test connectivity as well, WebSocket API will respond with pong frames as soon as possible. `ping` request along with `time` is a safe way to test request-response handling in your application.

**Weight:** 1

**Parameters:** NONE

**Data Source:** Memory

**Response:**

```
{  "id": "922bcc6e-9de8-440d-9e84-7c80933a8d0d",  "status": 200,  "result": {},  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 1    }  ]}
```

### Check server time[​](/docs/binance-spot-api-docs/testnet/websocket-api/general-requests#check-server-time "Direct link to Check server time")

```
{  "id": "187d3cb2-942d-484c-8271-4e2141bbadb1",  "method": "time"}
```

Test connectivity to the WebSocket API and get the current server time.

**Weight:** 1

**Parameters:** NONE

**Data Source:** Memory

**Response:**

```
{  "id": "187d3cb2-942d-484c-8271-4e2141bbadb1",  "status": 200,  "result": {    "serverTime": 1656400526260  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 1    }  ]}
```

### Exchange information[​](/docs/binance-spot-api-docs/testnet/websocket-api/general-requests#exchange-information "Direct link to Exchange information")

```
{  "id": "5494febb-d167-46a2-996d-70533eb4d976",  "method": "exchangeInfo",  "params": {    "symbols": ["BNBBTC"]  }}
```

Query current exchange trading rules, rate limits, and symbol information.

**Weight:** 20

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

NO

Describe a single symbol

`symbols`

ARRAY of STRING

Describe multiple symbols

`permissions`

ARRAY of STRING

Filter symbols by permissions

`showPermissionSets`

BOOLEAN

Controls whether the content of the `permissionSets` field is populated or not. Defaults to `true`.

`symbolStatus`

ENUM

Filters for symbols that have this `tradingStatus`.  
Valid values: `TRADING`, `HALT`, `BREAK`  
Cannot be used in combination with `symbol` or `symbols`

Notes:

-   Only one of `symbol`, `symbols`, `permissions` parameters can be specified.
    
-   Without parameters, `exchangeInfo` displays all symbols with `["SPOT, "MARGIN", "LEVERAGED"]` permissions.
    
    -   In order to list _all_ active symbols on the exchange, you need to explicitly request all permissions.
-   `permissions` accepts either a list of permissions, or a single permission name. E.g. `"SPOT"`.
    
-   [Available Permissions](/docs/binance-spot-api-docs/testnet/enums#account-and-symbol-permissions)
    

**Examples of Symbol Permissions Interpretation from the Response:**

-   `[["A","B"]]` means you may place an order if your account has either permission "A" **or** permission "B".
-   `[["A"],["B"]]` means you can place an order if your account has permission "A" **and** permission "B".
-   `[["A"],["B","C"]]` means you can place an order if your account has permission "A" **and** permission "B" or permission "C". (Inclusive or is applied here, not exclusive or, so your account may have both permission "B" and permission "C".)

**Data Source:** Memory

**Response:**

```
{  "id": "5494febb-d167-46a2-996d-70533eb4d976",  "status": 200,  "result": {    "timezone": "UTC",    "serverTime": 1655969291181,    // Global rate limits. See "Rate limits" section.    "rateLimits": [      {        "rateLimitType": "REQUEST_WEIGHT",    // Rate limit type: REQUEST_WEIGHT, ORDERS, CONNECTIONS        "interval": "MINUTE",                 // Rate limit interval: SECOND, MINUTE, DAY        "intervalNum": 1,                     // Rate limit interval multiplier (i.e., "1 minute")        "limit": 6000                         // Rate limit per interval      },      {        "rateLimitType": "ORDERS",        "interval": "SECOND",        "intervalNum": 10,        "limit": 50      },      {        "rateLimitType": "ORDERS",        "interval": "DAY",        "intervalNum": 1,        "limit": 160000      },      {        "rateLimitType": "CONNECTIONS",        "interval": "MINUTE",        "intervalNum": 5,        "limit": 300      }    ],    // Exchange filters are explained on the "Filters" page:    // https://github.com/binance/binance-spot-api-docs/blob/master/filters.md    // All exchange filters are optional.    "exchangeFilters": [],    "symbols": [      {        "symbol": "BNBBTC",        "status": "TRADING",        "baseAsset": "BNB",        "baseAssetPrecision": 8,        "quoteAsset": "BTC",        "quotePrecision": 8,        "quoteAssetPrecision": 8,        "baseCommissionPrecision": 8,        "quoteCommissionPrecision": 8,        "orderTypes": [          "LIMIT",          "LIMIT_MAKER",          "MARKET",          "STOP_LOSS_LIMIT",          "TAKE_PROFIT_LIMIT"        ],        "icebergAllowed": true,        "ocoAllowed": true,        "otoAllowed": true,        "quoteOrderQtyMarketAllowed": true,        "allowTrailingStop": true,        "cancelReplaceAllowed": true,        "amendAllowed":false,        "pegInstructionsAllowed": true,        "isSpotTradingAllowed": true,        "isMarginTradingAllowed": true,        // Symbol filters are explained on the "Filters" page:        // https://github.com/binance/binance-spot-api-docs/blob/master/filters.md        // All symbol filters are optional.        "filters": [          {            "filterType": "PRICE_FILTER",            "minPrice": "0.00000100",            "maxPrice": "100000.00000000",            "tickSize": "0.00000100"          },          {            "filterType": "LOT_SIZE",            "minQty": "0.00100000",            "maxQty": "100000.00000000",            "stepSize": "0.00100000"          }        ],        "permissions": [],        "permissionSets": [          [            "SPOT",            "MARGIN",            "TRD_GRP_004"          ]        ],        "defaultSelfTradePreventionMode": "NONE",        "allowedSelfTradePreventionModes": [          "NONE"        ]      }    ],    // Optional field. Present only when SOR is available.    // https://github.com/binance/binance-spot-api-docs/blob/master/faqs/sor_faq.md    "sors": [      {        "baseAsset": "BTC",        "symbols": [          "BTCUSDT",          "BTCUSDC"        ]      }    ]  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 20    }  ]}
```

-   [Test connectivity](/docs/binance-spot-api-docs/testnet/websocket-api/general-requests#test-connectivity)
-   [Check server time](/docs/binance-spot-api-docs/testnet/websocket-api/general-requests#check-server-time)
-   [Exchange information](/docs/binance-spot-api-docs/testnet/websocket-api/general-requests#exchange-information)


# Market data requests | Binance Open Platform

On this page

# Market data requests

### Order book[​](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#order-book "Direct link to Order book")

```
{  "id": "51e2affb-0aba-4821-ba75-f2625006eb43",  "method": "depth",  "params": {    "symbol": "BNBBTC",    "limit": 5  }}
```

Get current order book.

Note that this request returns limited market depth.

If you need to continuously monitor order book updates, please consider using WebSocket Streams:

-   [`<symbol>@depth<levels>`](/docs/binance-spot-api-docs/testnet/web-socket-streams#partial-book-depth-streams)
-   [`<symbol>@depth`](/docs/binance-spot-api-docs/testnet/web-socket-streams#diff-depth-stream)

You can use `depth` request together with `<symbol>@depth` streams to [maintain a local order book](/docs/binance-spot-api-docs/testnet/web-socket-streams#how-to-manage-a-local-order-book-correctly).

**Weight:** Adjusted based on the limit:

Limit

Weight

1–100

5

101–500

25

501–1000

50

1001–5000

250

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

YES

`limit`

INT

NO

Default: 100; Maximum: 5000

`symbolStatus`

ENUM

NO

Filters for symbols that have this `tradingStatus`.  
A status mismatch returns error `-1220 SYMBOL_DOES_NOT_MATCH_STATUS`  
Valid values: `TRADING`, `HALT`, `BREAK`

**Data Source:** Memory

**Response:**

```
{  "id": "51e2affb-0aba-4821-ba75-f2625006eb43",  "status": 200,  "result": {    "lastUpdateId": 2731179239,    // Bid levels are sorted from highest to lowest price.    "bids": [      [        "0.01379900",   // Price        "3.43200000"    // Quantity      ],      [        "0.01379800",        "3.24300000"      ],      [        "0.01379700",        "10.45500000"      ],      [        "0.01379600",        "3.82100000"      ],      [        "0.01379500",        "10.26200000"      ]    ],    // Ask levels are sorted from lowest to highest price.    "asks": [      [        "0.01380000",        "5.91700000"      ],      [        "0.01380100",        "6.01400000"      ],      [        "0.01380200",        "0.26800000"      ],      [        "0.01380300",        "0.33800000"      ],      [        "0.01380400",        "0.26800000"      ]    ]  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 2    }  ]}
```

### Recent trades[​](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#recent-trades "Direct link to Recent trades")

```
{  "id": "409a20bd-253d-41db-a6dd-687862a5882f",  "method": "trades.recent",  "params": {    "symbol": "BNBBTC",    "limit": 1  }}
```

Get recent trades.

If you need access to real-time trading activity, please consider using WebSocket Streams:

-   [`<symbol>@trade`](/docs/binance-spot-api-docs/testnet/web-socket-streams#trade-streams)

**Weight:** 25

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

YES

`limit`

INT

NO

Default: 500; Maximum: 1000

**Data Source:** Memory

**Response:**

```
{  "id": "409a20bd-253d-41db-a6dd-687862a5882f",  "status": 200,  "result": [    {      "id": 194686783,      "price": "0.01361000",      "qty": "0.01400000",      "quoteQty": "0.00019054",      "time": 1660009530807,      "isBuyerMaker": true,      "isBestMatch": true    }  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 2    }  ]}
```

### Historical trades[​](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#historical-trades "Direct link to Historical trades")

```
{  "id": "cffc9c7d-4efc-4ce0-b587-6b87448f052a",  "method": "trades.historical",  "params": {    "symbol": "BNBBTC",    "fromId": 0,    "limit": 1  }}
```

Get historical trades.

**Weight:** 25

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

YES

`fromId`

INT

NO

Trade ID to begin at

`limit`

INT

NO

Default: 500; Maximum: 1000

Notes:

-   If `fromId` is not specified, the most recent trades are returned.

**Data Source:** Database

**Response:**

```
{  "id": "cffc9c7d-4efc-4ce0-b587-6b87448f052a",  "status": 200,  "result": [    {      "id": 0,      "price": "0.00005000",      "qty": "40.00000000",      "quoteQty": "0.00200000",      "time": 1500004800376,      "isBuyerMaker": true,      "isBestMatch": true    }  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 10    }  ]}
```

### Aggregate trades[​](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#aggregate-trades "Direct link to Aggregate trades")

```
{  "id": "189da436-d4bd-48ca-9f95-9f613d621717",  "method": "trades.aggregate",  "params": {    "symbol": "BNBBTC",    "fromId": 50000000,    "limit": 1  }}
```

Get aggregate trades.

An _aggregate trade_ (aggtrade) represents one or more individual trades. Trades that fill at the same time, from the same taker order, with the same price – those trades are collected into an aggregate trade with total quantity of the individual trades.

If you need access to real-time trading activity, please consider using WebSocket Streams:

-   [`<symbol>@aggTrade`](/docs/binance-spot-api-docs/testnet/web-socket-streams#aggregate-trade-streams)

If you need historical aggregate trade data, please consider using [data.binance.vision](https://github.com/binance/binance-public-data/#aggtrades).

**Weight:** 4

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

YES

`fromId`

INT

NO

Aggregate trade ID to begin at

`startTime`

LONG

NO

`endTime`

LONG

NO

`limit`

INT

NO

Default: 500; Maximum: 1000

Notes:

-   If `fromId` is specified, return aggtrades with aggregate trade ID >= `fromId`.
    
    Use `fromId` and `limit` to page through all aggtrades.
    
-   If `startTime` and/or `endTime` are specified, aggtrades are filtered by execution time (`T`).
    
    `fromId` cannot be used together with `startTime` and `endTime`.
    
-   If no condition is specified, the most recent aggregate trades are returned.
    

**Data Source:** Database

**Response:**

```
{  "id": "189da436-d4bd-48ca-9f95-9f613d621717",  "status": 200,  "result": [    {      "a": 50000000,        // Aggregate trade ID      "p": "0.00274100",    // Price      "q": "57.19000000",   // Quantity      "f": 59120167,        // First trade ID      "l": 59120170,        // Last trade ID      "T": 1565877971222,   // Timestamp      "m": true,            // Was the buyer the maker?      "M": true             // Was the trade the best price match?    }  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 2    }  ]}
```

### Klines[​](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#klines "Direct link to Klines")

```
{  "id": "1dbbeb56-8eea-466a-8f6e-86bdcfa2fc0b",  "method": "klines",  "params": {    "symbol": "BNBBTC",    "interval": "1h",    "startTime": 1655969280000,    "limit": 1  }}
```

Get klines (candlestick bars).

Klines are uniquely identified by their open & close time.

If you need access to real-time kline updates, please consider using WebSocket Streams:

-   [`<symbol>@kline_<interval>`](/docs/binance-spot-api-docs/testnet/web-socket-streams#klinecandlestick-streams)

If you need historical kline data, please consider using [data.binance.vision](https://github.com/binance/binance-public-data/#klines).

**Weight:** 2

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

YES

`interval`

ENUM

YES

`startTime`

LONG

NO

`endTime`

LONG

NO

`timeZone`

STRING

NO

Default: 0 (UTC)

`limit`

INT

NO

Default: 500; Maximum: 1000

Supported kline intervals (case-sensitive):

Interval

`interval` value

seconds

`1s`

minutes

`1m`, `3m`, `5m`, `15m`, `30m`

hours

`1h`, `2h`, `4h`, `6h`, `8h`, `12h`

days

`1d`, `3d`

weeks

`1w`

months

`1M`

Notes:

-   If `startTime`, `endTime` are not specified, the most recent klines are returned.
-   Supported values for `timeZone`:
    -   Hours and minutes (e.g. `-1:00`, `05:45`)
    -   Only hours (e.g. `0`, `8`, `4`)
    -   Accepted range is strictly \[-12:00 to +14:00\] inclusive
-   If `timeZone` provided, kline intervals are interpreted in that timezone instead of UTC.
-   Note that `startTime` and `endTime` are always interpreted in UTC, regardless of timeZone.

**Data Source:** Database

**Response:**

```
{  "id": "1dbbeb56-8eea-466a-8f6e-86bdcfa2fc0b",  "status": 200,  "result": [    [      1655971200000,      // Kline open time      "0.01086000",       // Open price      "0.01086600",       // High price      "0.01083600",       // Low price      "0.01083800",       // Close price      "2290.53800000",    // Volume      1655974799999,      // Kline close time      "24.85074442",      // Quote asset volume      2283,               // Number of trades      "1171.64000000",    // Taker buy base asset volume      "12.71225884",      // Taker buy quote asset volume      "0"                 // Unused field, ignore    ]  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 2    }  ]}
```

### UI Klines[​](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#ui-klines "Direct link to UI Klines")

```
{  "id": "b137468a-fb20-4c06-bd6b-625148eec958",  "method": "uiKlines",  "params": {    "symbol": "BNBBTC",    "interval": "1h",    "startTime": 1655969280000,    "limit": 1  }}
```

Get klines (candlestick bars) optimized for presentation.

This request is similar to [`klines`](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#klines), having the same parameters and response. `uiKlines` return modified kline data, optimized for presentation of candlestick charts.

**Weight:** 2

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

YES

`interval`

ENUM

YES

See [`klines`](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#kline-intervals)

`startTime`

LONG

NO

`endTime`

LONG

NO

`timeZone`

STRING

NO

Default: 0 (UTC)

`limit`

INT

NO

Default: 500; Maximum: 1000

Notes:

-   If `startTime`, `endTime` are not specified, the most recent klines are returned.
-   Supported values for `timeZone`:
    -   Hours and minutes (e.g. `-1:00`, `05:45`)
    -   Only hours (e.g. `0`, `8`, `4`)
    -   Accepted range is strictly \[-12:00 to +14:00\] inclusive
-   If `timeZone` provided, kline intervals are interpreted in that timezone instead of UTC.
-   Note that `startTime` and `endTime` are always interpreted in UTC, regardless of timeZone.

**Data Source:** Database

**Response:**

```
{  "id": "b137468a-fb20-4c06-bd6b-625148eec958",  "status": 200,  "result": [    [      1655971200000,      // Kline open time      "0.01086000",       // Open price      "0.01086600",       // High price      "0.01083600",       // Low price      "0.01083800",       // Close price      "2290.53800000",    // Volume      1655974799999,      // Kline close time      "24.85074442",      // Quote asset volume      2283,               // Number of trades      "1171.64000000",    // Taker buy base asset volume      "12.71225884",      // Taker buy quote asset volume      "0"                 // Unused field, ignore    ]  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 2    }  ]}
```

### Current average price[​](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#current-average-price "Direct link to Current average price")

```
{  "id": "ddbfb65f-9ebf-42ec-8240-8f0f91de0867",  "method": "avgPrice",  "params": {    "symbol": "BNBBTC"  }}
```

Get current average price for a symbol.

**Weight:** 2

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

YES

**Data Source:** Memory

**Response:**

```
{  "id": "ddbfb65f-9ebf-42ec-8240-8f0f91de0867",  "status": 200,  "result": {    "mins": 5,                    // Average price interval (in minutes)    "price": "9.35751834",        // Average price    "closeTime": 1694061154503    // Last trade time  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 2    }  ]}
```

### 24hr ticker price change statistics[​](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#24hr-ticker-price-change-statistics "Direct link to 24hr ticker price change statistics")

```
{  "id": "93fb61ef-89f8-4d6e-b022-4f035a3fadad",  "method": "ticker.24hr",  "params": {    "symbol": "BNBBTC"  }}
```

Get 24-hour rolling window price change statistics.

If you need to continuously monitor trading statistics, please consider using WebSocket Streams:

-   [`<symbol>@ticker`](/docs/binance-spot-api-docs/testnet/web-socket-streams#individual-symbol-ticker-streams) or [`!ticker@arr`](/docs/binance-spot-api-docs/testnet/web-socket-streams#all-market-tickers-stream)
-   [`<symbol>@miniTicker`](/docs/binance-spot-api-docs/testnet/web-socket-streams#individual-symbol-mini-ticker-stream) or [`!miniTicker@arr`](/docs/binance-spot-api-docs/testnet/web-socket-streams#all-market-mini-tickers-stream)

If you need different window sizes, use the [`ticker`](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#rolling-window-price-change-statistics) request.

**Weight:** Adjusted based on the number of requested symbols:

Symbols

Weight

1–20

2

21–100

40

101 or more

80

all symbols

80

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

NO

Query ticker for a single symbol

`symbols`

ARRAY of STRING

Query ticker for multiple symbols

`type`

ENUM

NO

Ticker type: `FULL` (default) or `MINI`

symbolStatus

ENUM

NO

Filters for symbols that have this `tradingStatus`.  
For a single symbol, a status mismatch returns error `-1220 SYMBOL_DOES_NOT_MATCH_STATUS`.  
For multiple or all symbols, non-matching ones are simply excluded from the response.  
Valid values: `TRADING`, `HALT`, `BREAK`

Notes:

-   `symbol` and `symbols` cannot be used together.
    
-   If no symbol is specified, returns information about all symbols currently trading on the exchange.
    

**Data Source:** Memory

**Response:**

`FULL` type, for a single symbol:

```
{  "id": "93fb61ef-89f8-4d6e-b022-4f035a3fadad",  "status": 200,  "result": {    "symbol": "BNBBTC",    "priceChange": "0.00013900",    "priceChangePercent": "1.020",    "weightedAvgPrice": "0.01382453",    "prevClosePrice": "0.01362800",    "lastPrice": "0.01376700",    "lastQty": "1.78800000",    "bidPrice": "0.01376700",    "bidQty": "4.64600000",    "askPrice": "0.01376800",    "askQty": "14.31400000",    "openPrice": "0.01362800",    "highPrice": "0.01414900",    "lowPrice": "0.01346600",    "volume": "69412.40500000",    "quoteVolume": "959.59411487",    "openTime": 1660014164909,    "closeTime": 1660100564909,    "firstId": 194696115,       // First trade ID    "lastId": 194968287,        // Last trade ID    "count": 272173             // Number of trades  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 2    }  ]}
```

`MINI` type, for a single symbol:

```
{  "id": "9fa2a91b-3fca-4ed7-a9ad-58e3b67483de",  "status": 200,  "result": {    "symbol": "BNBBTC",    "openPrice": "0.01362800",    "highPrice": "0.01414900",    "lowPrice": "0.01346600",    "lastPrice": "0.01376700",    "volume": "69412.40500000",    "quoteVolume": "959.59411487",    "openTime": 1660014164909,    "closeTime": 1660100564909,    "firstId": 194696115,       // First trade ID    "lastId": 194968287,        // Last trade ID    "count": 272173             // Number of trades  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 2    }  ]}
```

If more than one symbol is requested, response returns an array:

```
{  "id": "901be0d9-fd3b-45e4-acd6-10c580d03430",  "status": 200,  "result": [    {      "symbol": "BNBBTC",      "priceChange": "0.00016500",      "priceChangePercent": "1.213",      "weightedAvgPrice": "0.01382508",      "prevClosePrice": "0.01360800",      "lastPrice": "0.01377200",      "lastQty": "1.01400000",      "bidPrice": "0.01377100",      "bidQty": "7.55700000",      "askPrice": "0.01377200",      "askQty": "4.37900000",      "openPrice": "0.01360700",      "highPrice": "0.01414900",      "lowPrice": "0.01346600",      "volume": "69376.27900000",      "quoteVolume": "959.13277091",      "openTime": 1660014615517,      "closeTime": 1660101015517,      "firstId": 194697254,      "lastId": 194969483,      "count": 272230    },    {      "symbol": "BTCUSDT",      "priceChange": "-938.06000000",      "priceChangePercent": "-3.938",      "weightedAvgPrice": "23265.34432003",      "prevClosePrice": "23819.17000000",      "lastPrice": "22880.91000000",      "lastQty": "0.00536000",      "bidPrice": "22880.40000000",      "bidQty": "0.00424000",      "askPrice": "22880.91000000",      "askQty": "0.04276000",      "openPrice": "23818.97000000",      "highPrice": "23933.25000000",      "lowPrice": "22664.69000000",      "volume": "153508.37606000",      "quoteVolume": "3571425225.04441220",      "openTime": 1660014615977,      "closeTime": 1660101015977,      "firstId": 1592019902,      "lastId": 1597301762,      "count": 5281861    }  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 2    }  ]}
```

### Trading Day Ticker[​](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#trading-day-ticker "Direct link to Trading Day Ticker")

```
{  "id": "f4b3b507-c8f2-442a-81a6-b2f12daa030f",  "method": "ticker.tradingDay",  "params": {    "symbols": [      "BNBBTC",      "BTCUSDT"    ],    "timeZone": "00:00"  }}
```

Price change statistics for a trading day.

**Weight:**

4 for each requested symbol.  
  
The weight for this request will cap at 200 once the number of `symbols` in the request is more than 50.

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

YES

Query ticker of a single symbol

`symbols`

ARRAY of STRING

Query ticker for multiple symbols

`timeZone`

STRING

NO

Default: 0 (UTC)

`type`

ENUM

NO

Supported values: FULL or MINI.  
If none provided, the default is FULL

symbolStatus

ENUM

NO

Filters for symbols that have this `tradingStatus`.  
For a single symbol, a status mismatch returns error `-1220 SYMBOL_DOES_NOT_MATCH_STATUS`.  
For multiple symbols, non-matching ones are simply excluded from the response.  
Valid values: `TRADING`, `HALT`, `BREAK`

**Notes:**

-   Supported values for `timeZone`:
    -   Hours and minutes (e.g. `-1:00`, `05:45`)
    -   Only hours (e.g. `0`, `8`, `4`)

**Data Source:** Database

**Response: - FULL**

With `symbol`:

```
{  "id": "f4b3b507-c8f2-442a-81a6-b2f12daa030f",  "status": 200,  "result": {    "symbol": "BTCUSDT",    "priceChange": "-83.13000000",                // Absolute price change    "priceChangePercent": "-0.317",               // Relative price change in percent    "weightedAvgPrice": "26234.58803036",         // quoteVolume / volume    "openPrice": "26304.80000000",    "highPrice": "26397.46000000",    "lowPrice": "26088.34000000",    "lastPrice": "26221.67000000",    "volume": "18495.35066000",                   // Volume in base asset    "quoteVolume": "485217905.04210480",    "openTime": 1695686400000,    "closeTime": 1695772799999,    "firstId": 3220151555,    "lastId": 3220849281,    "count": 697727  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 4    }  ]}
```

With `symbols`:

```
{  "id": "f4b3b507-c8f2-442a-81a6-b2f12daa030f",  "status": 200,  "result": [    {      "symbol": "BTCUSDT",      "priceChange": "-83.13000000",      "priceChangePercent": "-0.317",      "weightedAvgPrice": "26234.58803036",      "openPrice": "26304.80000000",      "highPrice": "26397.46000000",      "lowPrice": "26088.34000000",      "lastPrice": "26221.67000000",      "volume": "18495.35066000",      "quoteVolume": "485217905.04210480",      "openTime": 1695686400000,      "closeTime": 1695772799999,      "firstId": 3220151555,      "lastId": 3220849281,      "count": 697727    },    {      "symbol": "BNBUSDT",      "priceChange": "2.60000000",      "priceChangePercent": "1.238",      "weightedAvgPrice": "211.92276958",      "openPrice": "210.00000000",      "highPrice": "213.70000000",      "lowPrice": "209.70000000",      "lastPrice": "212.60000000",      "volume": "280709.58900000",      "quoteVolume": "59488753.54750000",      "openTime": 1695686400000,      "closeTime": 1695772799999,      "firstId": 672397461,      "lastId": 672496158,      "count": 98698    }  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 8    }  ]}
```

**Response: - MINI**

With `symbol`:

```
{  "id": "f4b3b507-c8f2-442a-81a6-b2f12daa030f",  "status": 200,  "result": {    "symbol": "BTCUSDT",    "openPrice": "26304.80000000",    "highPrice": "26397.46000000",    "lowPrice": "26088.34000000",    "lastPrice": "26221.67000000",    "volume": "18495.35066000",                  // Volume in base asset    "quoteVolume": "485217905.04210480",         // Volume in quote asset    "openTime": 1695686400000,    "closeTime": 1695772799999,    "firstId": 3220151555,                       // Trade ID of the first trade in the interval    "lastId": 3220849281,                        // Trade ID of the last trade in the interval    "count": 697727                              // Number of trades in the interval  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 4    }  ]}
```

With `symbols`:

```
{  "id": "f4b3b507-c8f2-442a-81a6-b2f12daa030f",  "status": 200,  "result": [    {      "symbol": "BTCUSDT",      "openPrice": "26304.80000000",      "highPrice": "26397.46000000",      "lowPrice": "26088.34000000",      "lastPrice": "26221.67000000",      "volume": "18495.35066000",      "quoteVolume": "485217905.04210480",      "openTime": 1695686400000,      "closeTime": 1695772799999,      "firstId": 3220151555,      "lastId": 3220849281,      "count": 697727    },    {      "symbol": "BNBUSDT",      "openPrice": "210.00000000",      "highPrice": "213.70000000",      "lowPrice": "209.70000000",      "lastPrice": "212.60000000",      "volume": "280709.58900000",      "quoteVolume": "59488753.54750000",      "openTime": 1695686400000,      "closeTime": 1695772799999,      "firstId": 672397461,      "lastId": 672496158,      "count": 98698    }  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 8    }  ]}
```

### Rolling window price change statistics[​](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#rolling-window-price-change-statistics "Direct link to Rolling window price change statistics")

```
{  "id": "f4b3b507-c8f2-442a-81a6-b2f12daa030f",  "method": "ticker",  "params": {    "symbols": [      "BNBBTC",      "BTCUSDT"    ],    "windowSize": "7d"  }}
```

Get rolling window price change statistics with a custom window.

This request is similar to [`ticker.24hr`](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#24hr-ticker-price-change-statistics), but statistics are computed on demand using the arbitrary window you specify.

**Note:** Window size precision is limited to 1 minute. While the `closeTime` is the current time of the request, `openTime` always start on a minute boundary. As such, the effective window might be up to 59999 ms wider than the requested `windowSize`.

Window computation example

For example, a request for `"windowSize": "7d"` might result in the following window:

```
"openTime": 1659580020000,"closeTime": 1660184865291,
```

Time of the request – `closeTime` – is 1660184865291 (August 11, 2022 02:27:45.291). Requested window size should put the `openTime` 7 days before that – August 4, 02:27:45.291 – but due to limited precision it ends up a bit earlier: 1659580020000 (August 4, 2022 02:27:00), exactly at the start of a minute.

If you need to continuously monitor trading statistics, please consider using WebSocket Streams:

-   [`<symbol>@ticker_<window_size>`](/docs/binance-spot-api-docs/testnet/web-socket-streams#individual-symbol-rolling-window-statistics-streams) or [`!ticker_<window-size>@arr`](/docs/binance-spot-api-docs/testnet/web-socket-streams#all-market-rolling-window-statistics-streams)

**Weight:** Adjusted based on the number of requested symbols:

Symbols

Weight

1–50

4 per symbol

51–100

200

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

YES

Query ticker of a single symbol

`symbols`

ARRAY of STRING

Query ticker for multiple symbols

`type`

ENUM

NO

Ticker type: `FULL` (default) or `MINI`

`windowSize`

ENUM

NO

Default `1d`

symbolStatus

ENUM

NO

Filters for symbols that have this `tradingStatus`.  
For a single symbol, a status mismatch returns error `-1220 SYMBOL_DOES_NOT_MATCH_STATUS`.  
For multiple symbols, non-matching ones are simply excluded from the response.  
Valid values: `TRADING`, `HALT`, `BREAK`

Supported window sizes:

Unit

`windowSize` value

minutes

`1m`, `2m` ... `59m`

hours

`1h`, `2h` ... `23h`

days

`1d`, `2d` ... `7d`

Notes:

-   Either `symbol` or `symbols` must be specified.
    
-   Maximum number of symbols in one request: 200.
    
-   Window size units cannot be combined. E.g., `1d 2h` is not supported.
    

**Data Source:** Database

**Response:**

`FULL` type, for a single symbol:

```
{  "id": "f4b3b507-c8f2-442a-81a6-b2f12daa030f",  "status": 200,  "result": {    "symbol": "BNBBTC",    "priceChange": "0.00061500",    "priceChangePercent": "4.735",    "weightedAvgPrice": "0.01368242",    "openPrice": "0.01298900",    "highPrice": "0.01418800",    "lowPrice": "0.01296000",    "lastPrice": "0.01360400",    "volume": "587179.23900000",    "quoteVolume": "8034.03382165",    "openTime": 1659580020000,    "closeTime": 1660184865291,    "firstId": 192977765,       // First trade ID    "lastId": 195365758,        // Last trade ID    "count": 2387994            // Number of trades  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 4    }  ]}
```

`MINI` type, for a single symbol:

```
{  "id": "bdb7c503-542c-495c-b797-4d2ee2e91173",  "status": 200,  "result": {    "symbol": "BNBBTC",    "openPrice": "0.01298900",    "highPrice": "0.01418800",    "lowPrice": "0.01296000",    "lastPrice": "0.01360400",    "volume": "587179.23900000",    "quoteVolume": "8034.03382165",    "openTime": 1659580020000,    "closeTime": 1660184865291,    "firstId": 192977765,       // First trade ID    "lastId": 195365758,        // Last trade ID    "count": 2387994            // Number of trades  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 4    }  ]}
```

If more than one symbol is requested, response returns an array:

```
{  "id": "f4b3b507-c8f2-442a-81a6-b2f12daa030f",  "status": 200,  "result": [    {      "symbol": "BNBBTC",      "priceChange": "0.00061500",      "priceChangePercent": "4.735",      "weightedAvgPrice": "0.01368242",      "openPrice": "0.01298900",      "highPrice": "0.01418800",      "lowPrice": "0.01296000",      "lastPrice": "0.01360400",      "volume": "587169.48600000",      "quoteVolume": "8033.90114517",      "openTime": 1659580020000,      "closeTime": 1660184820927,      "firstId": 192977765,      "lastId": 195365700,      "count": 2387936    },    {      "symbol": "BTCUSDT",      "priceChange": "1182.92000000",      "priceChangePercent": "5.113",      "weightedAvgPrice": "23349.27074846",      "openPrice": "23135.33000000",      "highPrice": "24491.22000000",      "lowPrice": "22400.00000000",      "lastPrice": "24318.25000000",      "volume": "1039498.10978000",      "quoteVolume": "24271522807.76838630",      "openTime": 1659580020000,      "closeTime": 1660184820927,      "firstId": 1568787779,      "lastId": 1604337406,      "count": 35549628    }  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 8    }  ]}
```

### Symbol price ticker[​](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#symbol-price-ticker "Direct link to Symbol price ticker")

```
{  "id": "043a7cf2-bde3-4888-9604-c8ac41fcba4d",  "method": "ticker.price",  "params": {    "symbol": "BNBBTC"  }}
```

Get the latest market price for a symbol.

If you need access to real-time price updates, please consider using WebSocket Streams:

-   [`<symbol>@aggTrade`](/docs/binance-spot-api-docs/testnet/web-socket-streams#aggregate-trade-streams)
-   [`<symbol>@trade`](/docs/binance-spot-api-docs/testnet/web-socket-streams#trade-streams)

**Weight:** Adjusted based on the number of requested symbols:

Parameter

Weight

`symbol`

2

`symbols`

4

none

4

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

NO

Query price for a single symbol

`symbols`

ARRAY of STRING

Query price for multiple symbols

symbolStatus

ENUM

NO

Filters for symbols that have this `tradingStatus`.  
For a single symbol, a status mismatch returns error `-1220 SYMBOL_DOES_NOT_MATCH_STATUS`.  
For multiple or all symbols, non-matching ones are simply excluded from the response.  
Valid values: `TRADING`, `HALT`, `BREAK`

Notes:

-   `symbol` and `symbols` cannot be used together.
    
-   If no symbol is specified, returns information about all symbols currently trading on the exchange.
    

**Data Source:** Memory

**Response:**

```
{  "id": "043a7cf2-bde3-4888-9604-c8ac41fcba4d",  "status": 200,  "result": {    "symbol": "BNBBTC",    "price": "0.01361900"  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 2    }  ]}
```

If more than one symbol is requested, response returns an array:

```
{  "id": "e739e673-24c8-4adf-9cfa-b81f30330b09",  "status": 200,  "result": [    {      "symbol": "BNBBTC",      "price": "0.01363700"    },    {      "symbol": "BTCUSDT",      "price": "24267.15000000"    },    {      "symbol": "BNBBUSD",      "price": "331.10000000"    }  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 4    }  ]}
```

### Symbol order book ticker[​](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#symbol-order-book-ticker "Direct link to Symbol order book ticker")

```
{  "id": "057deb3a-2990-41d1-b58b-98ea0f09e1b4",  "method": "ticker.book",  "params": {    "symbols": [      "BNBBTC",      "BTCUSDT"    ]  }}
```

Get the current best price and quantity on the order book.

If you need access to real-time order book ticker updates, please consider using WebSocket Streams:

-   [`<symbol>@bookTicker`](/docs/binance-spot-api-docs/testnet/web-socket-streams#individual-symbol-book-ticker-streams)

**Weight:** Adjusted based on the number of requested symbols:

Parameter

Weight

`symbol`

2

`symbols`

4

none

4

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

NO

Query ticker for a single symbol

`symbols`

ARRAY of STRING

Query ticker for multiple symbols

symbolStatus

ENUM

NO

Filters for symbols that have this `tradingStatus`.  
For a single symbol, a status mismatch returns error `-1220 SYMBOL_DOES_NOT_MATCH_STATUS`.  
For multiple or all symbols, non-matching ones are simply excluded from the response.  
Valid values: `TRADING`, `HALT`, `BREAK`

Notes:

-   `symbol` and `symbols` cannot be used together.
    
-   If no symbol is specified, returns information about all symbols currently trading on the exchange.
    

**Data Source:** Memory

**Response:**

```
{  "id": "9d32157c-a556-4d27-9866-66760a174b57",  "status": 200,  "result": {    "symbol": "BNBBTC",    "bidPrice": "0.01358000",    "bidQty": "12.53400000",    "askPrice": "0.01358100",    "askQty": "17.83700000"  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 2    }  ]}
```

If more than one symbol is requested, response returns an array:

```
{  "id": "057deb3a-2990-41d1-b58b-98ea0f09e1b4",  "status": 200,  "result": [    {      "symbol": "BNBBTC",      "bidPrice": "0.01358000",      "bidQty": "12.53400000",      "askPrice": "0.01358100",      "askQty": "17.83700000"    },    {      "symbol": "BTCUSDT",      "bidPrice": "23980.49000000",      "bidQty": "0.01000000",      "askPrice": "23981.31000000",      "askQty": "0.01512000"    }  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 4    }  ]}
```

-   [Order book](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#order-book)
-   [Recent trades](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#recent-trades)
-   [Historical trades](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#historical-trades)
-   [Aggregate trades](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#aggregate-trades)
-   [Klines](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#klines)
-   [UI Klines](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#ui-klines)
-   [Current average price](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#current-average-price)
-   [24hr ticker price change statistics](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#24hr-ticker-price-change-statistics)
-   [Trading Day Ticker](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#trading-day-ticker)
-   [Rolling window price change statistics](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#rolling-window-price-change-statistics)
-   [Symbol price ticker](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#symbol-price-ticker)
-   [Symbol order book ticker](/docs/binance-spot-api-docs/testnet/websocket-api/market-data-requests#symbol-order-book-ticker)


# Authentication requests | Binance Open Platform

On this page

# Authentication requests

**Note:** Only _Ed25519_ keys are supported for this feature.

### Log in with API key (SIGNED)[​](/docs/binance-spot-api-docs/testnet/websocket-api/authentication-requests#log-in-with-api-key-signed "Direct link to Log in with API key (SIGNED)")

```
{  "id": "c174a2b1-3f51-4580-b200-8528bd237cb7",  "method": "session.logon",  "params": {    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "signature": "1cf54395b336b0a9727ef27d5d98987962bc47aca6e13fe978612d0adee066ed",    "timestamp": 1649729878532  }}
```

Authenticate WebSocket connection using the provided API key.

After calling `session.logon`, you can omit `apiKey` and `signature` parameters for future requests that require them.

Note that only one API key can be authenticated. Calling `session.logon` multiple times changes the current authenticated API key.

**Weight:** 2

**Parameters:**

Name

Type

Mandatory

Description

`apiKey`

STRING

YES

`recvWindow`

DECIMAL

NO

The value cannot be greater than `60000`.  
Supports up to three decimal places of precision (e.g., 6000.346) so that microseconds may be specified.

`signature`

STRING

YES

`timestamp`

LONG

YES

**Data Source:** Memory

**Response:**

```
{  "id": "c174a2b1-3f51-4580-b200-8528bd237cb7",  "status": 200,  "result": {    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "authorizedSince": 1649729878532,    "connectedSince": 1649729873021,    "returnRateLimits": false,    "serverTime": 1649729878630,    "userDataStream": false // is User Data Stream subscription active?  }}
```

### Query session status[​](/docs/binance-spot-api-docs/testnet/websocket-api/authentication-requests#query-session-status "Direct link to Query session status")

```
{  "id": "b50c16cd-62c9-4e29-89e4-37f10111f5bf",  "method": "session.status"}
```

Query the status of the WebSocket connection, inspecting which API key (if any) is used to authorize requests.

**Weight:** 2

**Parameters:** NONE

**Data Source:** Memory

**Response:**

```
{  "id": "b50c16cd-62c9-4e29-89e4-37f10111f5bf",  "status": 200,  "result": {    // if the connection is not authenticated, "apiKey" and "authorizedSince" will be shown as null    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "authorizedSince": 1649729878532,    "connectedSince": 1649729873021,    "returnRateLimits": false,    "serverTime": 1649730611671,    "userDataStream": true // is User Data Stream subscription active?  }}
```

### Log out of the session[​](/docs/binance-spot-api-docs/testnet/websocket-api/authentication-requests#log-out-of-the-session "Direct link to Log out of the session")

```
{  "id": "c174a2b1-3f51-4580-b200-8528bd237cb7",  "method": "session.logout"}
```

Forget the API key previously authenticated. If the connection is not authenticated, this request does nothing.

Note that the WebSocket connection stays open after `session.logout` request. You can continue using the connection, but now you will have to explicitly provide the `apiKey` and `signature` parameters where needed.

**Weight:** 2

**Parameters:** NONE

**Data Source:** Memory

**Response:**

```
{  "id": "c174a2b1-3f51-4580-b200-8528bd237cb7",  "status": 200,  "result": {    "apiKey": null,    "authorizedSince": null,    "connectedSince": 1649729873021,    "returnRateLimits": false,    "serverTime": 1649730611671,    "userDataStream": false // is User Data Stream subscription active?  }}
```

-   [Log in with API key (SIGNED)](/docs/binance-spot-api-docs/testnet/websocket-api/authentication-requests#log-in-with-api-key-signed)
-   [Query session status](/docs/binance-spot-api-docs/testnet/websocket-api/authentication-requests#query-session-status)
-   [Log out of the session](/docs/binance-spot-api-docs/testnet/websocket-api/authentication-requests#log-out-of-the-session)


# Authentication requests | Binance Open Platform

On this page

# Authentication requests

**Note:** Only _Ed25519_ keys are supported for this feature.

### Log in with API key (SIGNED)[​](/docs/binance-spot-api-docs/testnet/websocket-api/authentication-requests#log-in-with-api-key-signed "Direct link to Log in with API key (SIGNED)")

```
{  "id": "c174a2b1-3f51-4580-b200-8528bd237cb7",  "method": "session.logon",  "params": {    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "signature": "1cf54395b336b0a9727ef27d5d98987962bc47aca6e13fe978612d0adee066ed",    "timestamp": 1649729878532  }}
```

Authenticate WebSocket connection using the provided API key.

After calling `session.logon`, you can omit `apiKey` and `signature` parameters for future requests that require them.

Note that only one API key can be authenticated. Calling `session.logon` multiple times changes the current authenticated API key.

**Weight:** 2

**Parameters:**

Name

Type

Mandatory

Description

`apiKey`

STRING

YES

`recvWindow`

DECIMAL

NO

The value cannot be greater than `60000`.  
Supports up to three decimal places of precision (e.g., 6000.346) so that microseconds may be specified.

`signature`

STRING

YES

`timestamp`

LONG

YES

**Data Source:** Memory

**Response:**

```
{  "id": "c174a2b1-3f51-4580-b200-8528bd237cb7",  "status": 200,  "result": {    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "authorizedSince": 1649729878532,    "connectedSince": 1649729873021,    "returnRateLimits": false,    "serverTime": 1649729878630,    "userDataStream": false // is User Data Stream subscription active?  }}
```

### Query session status[​](/docs/binance-spot-api-docs/testnet/websocket-api/authentication-requests#query-session-status "Direct link to Query session status")

```
{  "id": "b50c16cd-62c9-4e29-89e4-37f10111f5bf",  "method": "session.status"}
```

Query the status of the WebSocket connection, inspecting which API key (if any) is used to authorize requests.

**Weight:** 2

**Parameters:** NONE

**Data Source:** Memory

**Response:**

```
{  "id": "b50c16cd-62c9-4e29-89e4-37f10111f5bf",  "status": 200,  "result": {    // if the connection is not authenticated, "apiKey" and "authorizedSince" will be shown as null    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "authorizedSince": 1649729878532,    "connectedSince": 1649729873021,    "returnRateLimits": false,    "serverTime": 1649730611671,    "userDataStream": true // is User Data Stream subscription active?  }}
```

### Log out of the session[​](/docs/binance-spot-api-docs/testnet/websocket-api/authentication-requests#log-out-of-the-session "Direct link to Log out of the session")

```
{  "id": "c174a2b1-3f51-4580-b200-8528bd237cb7",  "method": "session.logout"}
```

Forget the API key previously authenticated. If the connection is not authenticated, this request does nothing.

Note that the WebSocket connection stays open after `session.logout` request. You can continue using the connection, but now you will have to explicitly provide the `apiKey` and `signature` parameters where needed.

**Weight:** 2

**Parameters:** NONE

**Data Source:** Memory

**Response:**

```
{  "id": "c174a2b1-3f51-4580-b200-8528bd237cb7",  "status": 200,  "result": {    "apiKey": null,    "authorizedSince": null,    "connectedSince": 1649729873021,    "returnRateLimits": false,    "serverTime": 1649730611671,    "userDataStream": false // is User Data Stream subscription active?  }}
```

-   [Log in with API key (SIGNED)](/docs/binance-spot-api-docs/testnet/websocket-api/authentication-requests#log-in-with-api-key-signed)
-   [Query session status](/docs/binance-spot-api-docs/testnet/websocket-api/authentication-requests#query-session-status)
-   [Log out of the session](/docs/binance-spot-api-docs/testnet/websocket-api/authentication-requests#log-out-of-the-session)



# Account requests | Binance Open Platform

On this page

# Account requests

### Account information (USER\_DATA)[​](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#account-information-user_data "Direct link to Account information (USER_DATA)")

```
{  "id": "605a6d20-6588-4cb9-afa0-b0ab087507ba",  "method": "account.status",  "params": {    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "signature": "83303b4a136ac1371795f465808367242685a9e3a42b22edb4d977d0696eb45c",    "timestamp": 1660801839480  }}
```

Query information about your account.

**Weight:** 20

**Parameters:**

Name

Type

Mandatory

Description

`apiKey`

STRING

YES

`omitZeroBalances`

BOOLEAN

NO

When set to `true`, emits only the non-zero balances of an account.  
Default value: false

`recvWindow`

DECIMAL

NO

The value cannot be greater than `60000`.  
Supports up to three decimal places of precision (e.g., 6000.346) so that microseconds may be specified.

`signature`

STRING

YES

`timestamp`

LONG

YES

**Data Source:** Memory => Database

**Response:**

```
{  "id": "605a6d20-6588-4cb9-afa0-b0ab087507ba",  "status": 200,  "result": {    "makerCommission": 15,    "takerCommission": 15,    "buyerCommission": 0,    "sellerCommission": 0,    "canTrade": true,    "canWithdraw": true,    "canDeposit": true,    "commissionRates": {      "maker": "0.00150000",      "taker": "0.00150000",      "buyer": "0.00000000",      "seller": "0.00000000"    },    "brokered": false,    "requireSelfTradePrevention": false,    "preventSor": false,    "updateTime": 1660801833000,    "accountType": "SPOT",    "balances": [      {        "asset": "BNB",        "free": "0.00000000",        "locked": "0.00000000"      },      {        "asset": "BTC",        "free": "1.3447112",        "locked": "0.08600000"      },      {        "asset": "USDT",        "free": "1021.21000000",        "locked": "0.00000000"      }    ],    "permissions": [      "SPOT"    ],    "uid": 354937868  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 20    }  ]}
```

### Query order (USER\_DATA)[​](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#query-order-user_data "Direct link to Query order (USER_DATA)")

```
{  "id": "aa62318a-5a97-4f3b-bdc7-640bbe33b291",  "method": "order.status",  "params": {    "symbol": "BTCUSDT",    "orderId": 12569099453,    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "signature": "2c3aab5a078ee4ea465ecd95523b77289f61476c2f238ec10c55ea6cb11a6f35",    "timestamp": 1660801720951  }}
```

Check execution status of an order.

**Weight:** 4

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

YES

`orderId`

LONG

YES

Lookup order by `orderId`

`origClientOrderId`

STRING

Lookup order by `clientOrderId`

`apiKey`

STRING

YES

`recvWindow`

DECIMAL

NO

The value cannot be greater than 60000.  
Supports up to three decimal places of precision (e.g., 6000.346) so that microseconds may be specified.

`signature`

STRING

YES

`timestamp`

LONG

YES

Notes:

-   If both `orderId` and `origClientOrderId` are provided, the `orderId` is searched first, then the `origClientOrderId` from that result is checked against that order. If both conditions are not met the request will be rejected.
    
-   For some historical orders the `cummulativeQuoteQty` response field may be negative, meaning the data is not available at this time.
    

**Data Source:** Memory => Database

**Response:**

```
{  "id": "aa62318a-5a97-4f3b-bdc7-640bbe33b291",  "status": 200,  "result": {    "symbol": "BTCUSDT",    "orderId": 12569099453,    "orderListId": -1,                  // set only for orders of an order list    "clientOrderId": "4d96324ff9d44481926157",    "price": "23416.10000000",    "origQty": "0.00847000",    "executedQty": "0.00847000",    "cummulativeQuoteQty": "198.33521500",    "status": "FILLED",    "timeInForce": "GTC",    "type": "LIMIT",    "side": "SELL",    "stopPrice": "0.00000000",          // always present, zero if order type does not use stopPrice    "trailingDelta": 10,                // present only if trailingDelta set for the order    "trailingTime": -1,                 // present only if trailingDelta set for the order    "icebergQty": "0.00000000",         // always present, zero for non-iceberg orders    "time": 1660801715639,              // time when the order was placed    "updateTime": 1660801717945,        // time of the last update to the order    "isWorking": true,    "workingTime": 1660801715639,    "origQuoteOrderQty": "0.00000000"   // always present, zero if order type does not use quoteOrderQty    "strategyId": 37463720,             // present only if strategyId set for the order    "strategyType": 1000000,            // present only if strategyType set for the order    "selfTradePreventionMode": "NONE",    "preventedMatchId": 0,              // present only if the order expired due to STP    "preventedQuantity": "1.200000"     // present only if the order expired due to STP  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 4    }  ]}
```

**Note:** The payload above does not show all fields that can appear. Please refer to [Conditional fields in Order Responses](/docs/binance-spot-api-docs/testnet/websocket-api/trading-requests#conditional-fields-in-order-responses).

### Current open orders (USER\_DATA)[​](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#current-open-orders-user_data "Direct link to Current open orders (USER_DATA)")

```
{  "id": "55f07876-4f6f-4c47-87dc-43e5fff3f2e7",  "method": "openOrders.status",  "params": {    "symbol": "BTCUSDT",    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "signature": "d632b3fdb8a81dd44f82c7c901833309dd714fe508772a89b0a35b0ee0c48b89",    "timestamp": 1660813156812  }}
```

Query execution status of all open orders.

If you need to continuously monitor order status updates, please consider using WebSocket Streams:

-   [`userDataStream.start`](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#user-data-stream-requests) request
-   [`executionReport`](/docs/binance-spot-api-docs/testnet/user-data-stream#order-update) user data stream event

**Weight:** Adjusted based on the number of requested symbols:

Parameter

Weight

`symbol`

6

none

80

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

NO

If omitted, open orders for all symbols are returned

`apiKey`

STRING

YES

`recvWindow`

DECIMAL

NO

The value cannot be greater than `60000`.  
Supports up to three decimal places of precision (e.g., 6000.346) so that microseconds may be specified.

`signature`

STRING

YES

`timestamp`

LONG

YES

**Data Source:** Memory => Database

**Response:**

Status reports for open orders are identical to [`order.status`](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#query-order-user_data).

Note that some fields are optional and included only for orders that set them.

Open orders are always returned as a flat list. If all symbols are requested, use the `symbol` field to tell which symbol the orders belong to.

```
{  "id": "55f07876-4f6f-4c47-87dc-43e5fff3f2e7",  "status": 200,  "result": [    {      "symbol": "BTCUSDT",      "orderId": 12569099453,      "orderListId": -1,      "clientOrderId": "4d96324ff9d44481926157",      "price": "23416.10000000",      "origQty": "0.00847000",      "executedQty": "0.00720000",      "cummulativeQuoteQty": "172.43931000",      "status": "PARTIALLY_FILLED",      "timeInForce": "GTC",      "type": "LIMIT",      "side": "SELL",      "stopPrice": "0.00000000",      "icebergQty": "0.00000000",      "time": 1660801715639,      "updateTime": 1660801717945,      "isWorking": true,      "workingTime": 1660801715639,      "origQuoteOrderQty": "0.00000000",      "selfTradePreventionMode": "NONE"    }  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 6    }  ]}
```

**Note:** The payload above does not show all fields that can appear. Please refer to [Conditional fields in Order Responses](/docs/binance-spot-api-docs/testnet/websocket-api/trading-requests#conditional-fields-in-order-responses).

### Account order history (USER\_DATA)[​](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#account-order-history-user_data "Direct link to Account order history (USER_DATA)")

```
{  "id": "734235c2-13d2-4574-be68-723e818c08f3",  "method": "allOrders",  "params": {    "symbol": "BTCUSDT",    "startTime": 1660780800000,    "endTime": 1660867200000,    "limit": 5,    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "signature": "f50a972ba7fad92842187643f6b930802d4e20bce1ba1e788e856e811577bd42",    "timestamp": 1661955123341  }}
```

Query information about all your orders – active, canceled, filled – filtered by time range.

**Weight:** 20

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

YES

`orderId`

LONG

NO

Order ID to begin at

`startTime`

LONG

NO

`endTime`

LONG

NO

`limit`

INT

NO

Default: 500; Maximum: 1000

`apiKey`

STRING

YES

`recvWindow`

DECIMAL

NO

The value cannot be greater than `60000`.  
Supports up to three decimal places of precision (e.g., 6000.346) so that microseconds may be specified.

`signature`

STRING

YES

`timestamp`

LONG

YES

Notes:

-   If `startTime` and/or `endTime` are specified, `orderId` is ignored.
    
    Orders are filtered by `time` of the last execution status update.
    
-   If `orderId` is specified, return orders with order ID >= `orderId`.
    
-   If no condition is specified, the most recent orders are returned.
    
-   For some historical orders the `cummulativeQuoteQty` response field may be negative, meaning the data is not available at this time.
    
-   The time between `startTime` and `endTime` can't be longer than 24 hours.
    

**Data Source:** Database

**Response:**

Status reports for orders are identical to [`order.status`](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#query-order-user_data).

Note that some fields are optional and included only for orders that set them.

```
{  "id": "734235c2-13d2-4574-be68-723e818c08f3",  "status": 200,  "result": [    {      "symbol": "BTCUSDT",      "orderId": 12569099453,      "orderListId": -1,      "clientOrderId": "4d96324ff9d44481926157",      "price": "23416.10000000",      "origQty": "0.00847000",      "executedQty": "0.00847000",      "cummulativeQuoteQty": "198.33521500",      "status": "FILLED",      "timeInForce": "GTC",      "type": "LIMIT",      "side": "SELL",      "stopPrice": "0.00000000",      "icebergQty": "0.00000000",      "time": 1660801715639,      "updateTime": 1660801717945,      "isWorking": true,      "workingTime": 1660801715639,      "origQuoteOrderQty": "0.00000000",      "selfTradePreventionMode": "NONE",      "preventedMatchId": 0,            // This field only appears if the order expired due to STP.      "preventedQuantity": "1.200000"   // This field only appears if the order expired due to STP.    }  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 20    }  ]}
```

### Query Order list (USER\_DATA)[​](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#query-order-list-user_data "Direct link to Query Order list (USER_DATA)")

```
{  "id": "b53fd5ff-82c7-4a04-bd64-5f9dc42c2100",  "method": "orderList.status",  "params": {    "origClientOrderId": "08985fedd9ea2cf6b28996"    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "signature": "d12f4e8892d46c0ddfbd43d556ff6d818581b3be22a02810c2c20cb719aed6a4",    "timestamp": 1660801713965  }}
```

Check execution status of an Order list.

For execution status of individual orders, use [`order.status`](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#query-order-user_data).

**Weight:** 4

**Parameters**:

Name

Type

Mandatory

Description

`origClientOrderId`

STRING

NO\*

Query order list by `listClientOrderId`.  
`orderListId` or `origClientOrderId` must be provided.

`orderListId`

INT

Query order list by `orderListId`.  
`orderListId` or `origClientOrderId` must be provided.

`apiKey`

STRING

YES

`recvWindow`

DECIMAL

NO

The value cannot be greater than 60000.  
Supports up to three decimal places of precision (e.g., 6000.346) so that microseconds may be specified.

`signature`

STRING

YES

`timestamp`

LONG

YES

Notes:

-   `origClientOrderId` refers to `listClientOrderId` of the order list itself.
    
-   If both `origClientOrderId` and `orderListId` parameters are specified, only `origClientOrderId` is used and `orderListId` is ignored.
    

**Data Source:** Database

**Response:**

```
{  "id": "b53fd5ff-82c7-4a04-bd64-5f9dc42c2100",  "status": 200,  "result": {    "orderListId": 1274512,    "contingencyType": "OCO",    "listStatusType": "EXEC_STARTED",    "listOrderStatus": "EXECUTING",    "listClientOrderId": "08985fedd9ea2cf6b28996",    "transactionTime": 1660801713793,    "symbol": "BTCUSDT",    "orders": [      {        "symbol": "BTCUSDT",        "orderId": 12569138901,        "clientOrderId": "BqtFCj5odMoWtSqGk2X9tU"      },      {        "symbol": "BTCUSDT",        "orderId": 12569138902,        "clientOrderId": "jLnZpj5enfMXTuhKB1d0us"      }    ]  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 4    }  ]}
```

### Current open order lists (USER\_DATA)[​](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#current-open-order-lists-user_data "Direct link to Current open order lists (USER_DATA)")

```
{  "id": "3a4437e2-41a3-4c19-897c-9cadc5dce8b6",  "method": "openOrderLists.status",  "params": {    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "signature": "1bea8b157dd78c3da30359bddcd999e4049749fe50b828e620e12f64e8b433c9",    "timestamp": 1660801713831  }}
```

Query execution status of all open order lists.

If you need to continuously monitor order status updates, please consider using WebSocket Streams:

-   [`userDataStream.start`](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#user-data-stream-requests) request
-   [`executionReport`](/docs/binance-spot-api-docs/testnet/user-data-stream#order-update) user data stream event

**Weight**: 6

**Parameters:**

Name

Type

Mandatory

Description

`apiKey`

STRING

YES

`recvWindow`

DECIMAL

NO

The value cannot be greater than `60000`.  
Supports up to three decimal places of precision (e.g., 6000.346) so that microseconds may be specified.

`signature`

STRING

YES

`timestamp`

LONG

YES

**Data Source:** Database

**Response:**

```
{  "id": "3a4437e2-41a3-4c19-897c-9cadc5dce8b6",  "status": 200,  "result": [    {      "orderListId": 0,      "contingencyType": "OCO",      "listStatusType": "EXEC_STARTED",      "listOrderStatus": "EXECUTING",      "listClientOrderId": "08985fedd9ea2cf6b28996",      "transactionTime": 1660801713793,      "symbol": "BTCUSDT",      "orders": [        {          "symbol": "BTCUSDT",          "orderId": 4,          "clientOrderId": "CUhLgTXnX5n2c0gWiLpV4d"        },        {          "symbol": "BTCUSDT",          "orderId": 5,          "clientOrderId": "1ZqG7bBuYwaF4SU8CwnwHm"        }      ]    }  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 6    }  ]}
```

### Account order list history (USER\_DATA)[​](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#account-order-list-history-user_data "Direct link to Account order list history (USER_DATA)")

```
{  "id": "8617b7b3-1b3d-4dec-94cd-eefd929b8ceb",  "method": "allOrderLists",  "params": {    "startTime": 1660780800000,    "endTime": 1660867200000,    "limit": 5,    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "signature": "c8e1484db4a4a02d0e84dfa627eb9b8298f07ebf12fcc4eaf86e4a565b2712c2",    "timestamp": 1661955123341  }}
```

Query information about all your order lists, filtered by time range.

**Weight:** 20

**Parameters:**

Name

Type

Mandatory

Description

`fromId`

INT

NO

Order list ID to begin at

`startTime`

LONG

NO

`endTime`

LONG

NO

`limit`

INT

NO

Default: 500; Maximum: 1000

`apiKey`

STRING

YES

`recvWindow`

DECIMAL

NO

The value cannot be greater than `60000`.  
Supports up to three decimal places of precision (e.g., 6000.346) so that microseconds may be specified.

`signature`

STRING

YES

`timestamp`

LONG

YES

Notes:

-   If `startTime` and/or `endTime` are specified, `fromId` is ignored.
    
    Order lists are filtered by `transactionTime` of the last order list execution status update.
    
-   If `fromId` is specified, return order lists with order list ID >= `fromId`.
    
-   If no condition is specified, the most recent order lists are returned.
    
-   The time between `startTime` and `endTime` can't be longer than 24 hours.
    

**Data Source:** Database

**Response:**

Status reports for order lists are identical to [`orderList.status`](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#query-order-list-user_data).

```
{  "id": "8617b7b3-1b3d-4dec-94cd-eefd929b8ceb",  "status": 200,  "result": [    {      "orderListId": 1274512,      "contingencyType": "OCO",      "listStatusType": "EXEC_STARTED",      "listOrderStatus": "EXECUTING",      "listClientOrderId": "08985fedd9ea2cf6b28996",      "transactionTime": 1660801713793,      "symbol": "BTCUSDT",      "orders": [        {          "symbol": "BTCUSDT",          "orderId": 12569138901,          "clientOrderId": "BqtFCj5odMoWtSqGk2X9tU"        },        {          "symbol": "BTCUSDT",          "orderId": 12569138902,          "clientOrderId": "jLnZpj5enfMXTuhKB1d0us"        }      ]    }  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 20    }  ]}
```

### Account trade history (USER\_DATA)[​](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#account-trade-history-user_data "Direct link to Account trade history (USER_DATA)")

```
{  "id": "f4ce6a53-a29d-4f70-823b-4ab59391d6e8",  "method": "myTrades",  "params": {    "symbol": "BTCUSDT",    "startTime": 1660780800000,    "endTime": 1660867200000,    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "signature": "c5a5ffb79fd4f2e10a92f895d488943a57954edf5933bde3338dfb6ea6d6eefc",    "timestamp": 1661955125250  }}
```

Query information about all your trades, filtered by time range.

**Weight:**

Condition

Weight

Without orderId

20

With orderId

5

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

YES

`orderId`

LONG

NO

`startTime`

LONG

NO

`endTime`

LONG

NO

`fromId`

INT

NO

First trade ID to query

`limit`

INT

NO

Default: 500; Maximum: 1000

`apiKey`

STRING

YES

`recvWindow`

DECIMAL

NO

The value cannot be greater than `60000`.  
Supports up to three decimal places of precision (e.g., 6000.346) so that microseconds may be specified.

`signature`

STRING

YES

`timestamp`

LONG

YES

Notes:

-   If `fromId` is specified, return trades with trade ID >= `fromId`.
    
-   If `startTime` and/or `endTime` are specified, trades are filtered by execution time (`time`).
    
    `fromId` cannot be used together with `startTime` and `endTime`.
    
-   If `orderId` is specified, only trades related to that order are returned.
    
    `startTime` and `endTime` cannot be used together with `orderId`.
    
-   If no condition is specified, the most recent trades are returned.
    
-   The time between `startTime` and `endTime` can't be longer than 24 hours.
    

**Data Source:** Memory => Database

**Response:**

```
{  "id": "f4ce6a53-a29d-4f70-823b-4ab59391d6e8",  "status": 200,  "result": [    {      "symbol": "BTCUSDT",      "id": 1650422481,      "orderId": 12569099453,      "orderListId": -1,      "price": "23416.10000000",      "qty": "0.00635000",      "quoteQty": "148.69223500",      "commission": "0.00000000",      "commissionAsset": "BNB",      "time": 1660801715793,      "isBuyer": false,      "isMaker": true,      "isBestMatch": true    },    {      "symbol": "BTCUSDT",      "id": 1650422482,      "orderId": 12569099453,      "orderListId": -1,      "price": "23416.50000000",      "qty": "0.00212000",      "quoteQty": "49.64298000",      "commission": "0.00000000",      "commissionAsset": "BNB",      "time": 1660801715793,      "isBuyer": false,      "isMaker": true,      "isBestMatch": true    }  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 20    }  ]}
```

### Account unfilled order count (USER\_DATA)[​](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#account-unfilled-order-count-user_data "Direct link to Account unfilled order count (USER_DATA)")

```
{  "id": "d3783d8d-f8d1-4d2c-b8a0-b7596af5a664",  "method": "account.rateLimits.orders",  "params": {    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "signature": "76289424d6e288f4dc47d167ac824e859dabf78736f4348abbbac848d719eb94",    "timestamp": 1660801839500  }}
```

Query your current unfilled order count for all intervals.

**Weight:** 40

**Parameters:**

Name

Type

Mandatory

Description

`apiKey`

STRING

YES

`recvWindow`

DECIMAL

NO

The value cannot be greater than `60000`.  
Supports up to three decimal places of precision (e.g., 6000.346) so that microseconds may be specified.

`signature`

STRING

YES

`timestamp`

LONG

YES

**Data Source:** Memory

**Response:**

```
{  "id": "d3783d8d-f8d1-4d2c-b8a0-b7596af5a664",  "status": 200,  "result": [    {      "rateLimitType": "ORDERS",      "interval": "SECOND",      "intervalNum": 10,      "limit": 50,      "count": 0    },    {      "rateLimitType": "ORDERS",      "interval": "DAY",      "intervalNum": 1,      "limit": 160000,      "count": 0    }  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 40    }  ]}
```

### Account prevented matches (USER\_DATA)[​](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#account-prevented-matches-user_data "Direct link to Account prevented matches (USER_DATA)")

```
{  "id": "g4ce6a53-a39d-4f71-823b-4ab5r391d6y8",  "method": "myPreventedMatches",  "params": {    "symbol": "BTCUSDT",    "orderId": 35,    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "signature": "c5a5ffb79fd4f2e10a92f895d488943a57954edf5933bde3338dfb6ea6d6eefc",    "timestamp": 1673923281052  }}
```

Displays the list of orders that were expired due to STP.

These are the combinations supported:

-   `symbol` + `preventedMatchId`
-   `symbol` + `orderId`
-   `symbol` + `orderId` + `fromPreventedMatchId` (`limit` will default to 500)
-   `symbol` + `orderId` + `fromPreventedMatchId` + `limit`

**Parameters:**

Name

Type

Mandatory

Description

symbol

STRING

YES

preventedMatchId

LONG

NO

orderId

LONG

NO

fromPreventedMatchId

LONG

NO

limit

INT

NO

Default: `500`; Maximum: `1000`

recvWindow

DECIMAL

NO

The value cannot be greater than `60000`.  
Supports up to three decimal places of precision (e.g., 6000.346) so that microseconds may be specified.

timestamp

LONG

YES

**Weight**

Case

Weight

If `symbol` is invalid

2

Querying by `preventedMatchId`

2

Querying by `orderId`

20

**Data Source:**

Database

**Response:**

```
{  "id": "g4ce6a53-a39d-4f71-823b-4ab5r391d6y8",  "status": 200,  "result": [    {      "symbol": "BTCUSDT",      "preventedMatchId": 1,      "takerOrderId": 5,      "makerSymbol": "BTCUSDT",      "makerOrderId": 3,      "tradeGroupId": 1,      "selfTradePreventionMode": "EXPIRE_MAKER",      "price": "1.100000",      "makerPreventedQuantity": "1.300000",      "transactTime": 1669101687094    }  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 20    }  ]}
```

### Account allocations (USER\_DATA)[​](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#account-allocations-user_data "Direct link to Account allocations (USER_DATA)")

```
{  "id": "g4ce6a53-a39d-4f71-823b-4ab5r391d6y8",  "method": "myAllocations",  "params": {    "symbol": "BTCUSDT",    "orderId": 500,    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "signature": "c5a5ffb79fd4f2e10a92f895d488943a57954edf5933bde3338dfb6ea6d6eefc",    "timestamp": 1673923281052  }}
```

Retrieves allocations resulting from SOR order placement.

**Weight:** 20

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

Yes

`startTime`

LONG

No

`endTime`

LONG

No

`fromAllocationId`

INT

No

`limit`

INT

No

Default: 500; Maximum: 1000

`orderId`

LONG

No

`recvWindow`

DECIMAL

No

The value cannot be greater than `60000`.  
Supports up to three decimal places of precision (e.g., 6000.346) so that microseconds may be specified.

`timestamp`

LONG

No

Supported parameter combinations:

Parameters

Response

`symbol`

allocations from oldest to newest

`symbol` + `startTime`

oldest allocations since `startTime`

`symbol` + `endTime`

newest allocations until `endTime`

`symbol` + `startTime` + `endTime`

allocations within the time range

`symbol` + `fromAllocationId`

allocations by allocation ID

`symbol` + `orderId`

allocations related to an order starting with oldest

`symbol` + `orderId` + `fromAllocationId`

allocations related to an order by allocation ID

**Note:** The time between `startTime` and `endTime` can't be longer than 24 hours.

**Data Source:** Database

**Response:**

```
{  "id": "g4ce6a53-a39d-4f71-823b-4ab5r391d6y8",  "status": 200,  "result": [    {      "symbol": "BTCUSDT",      "allocationId": 0,      "allocationType": "SOR",      "orderId": 500,      "orderListId": -1,      "price": "1.00000000",      "qty": "0.10000000",      "quoteQty": "0.10000000",      "commission": "0.00000000",      "commissionAsset": "BTC",      "time": 1687319487614,      "isBuyer": false,      "isMaker": false,      "isAllocator": false    }  ],  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 20    }  ]}
```

### Account Commission Rates (USER\_DATA)[​](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#account-commission-rates-user_data "Direct link to Account Commission Rates (USER_DATA)")

```
{  "id": "d3df8a61-98ea-4fe0-8f4e-0fcea5d418b0",  "method": "account.commission",  "params": {    "symbol": "BTCUSDT",    "apiKey": "vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A",    "signature": "c5a5ffb79fd4f2e10a92f895d488943a57954edf5933bde3338dfb6ea6d6eefc",    "timestamp": 1673923281052  }}
```

Get current account commission rates.

**Parameters:**

Name

Type

Mandatory

Description

`symbol`

STRING

YES

**Weight:** 20

**Data Source:** Database

**Response:**

```
{  "id": "d3df8a61-98ea-4fe0-8f4e-0fcea5d418b0",  "status": 200,  "result": {    "symbol": "BTCUSDT",    "standardCommission": {     //Standard commission rates on trades from the order.      "maker": "0.00000010",      "taker": "0.00000020",      "buyer": "0.00000030",      "seller": "0.00000040"    },    "specialCommission": {      // Special commission rates from the order.      "maker": "0.01000000",      "taker": "0.02000000",      "buyer": "0.03000000",      "seller": "0.04000000"    },    "taxCommission": {          //Tax commission rates on trades from the order.      "maker": "0.00000112",      "taker": "0.00000114",      "buyer": "0.00000118",      "seller": "0.00000116"    },    "discount": {                //Discount on standard commissions when paying in BNB.      "enabledForAccount": true,      "enabledForSymbol": true,      "discountAsset": "BNB",      "discount": "0.75000000"   //Standard commission is reduced by this rate when paying commission in BNB.    }  },  "rateLimits": [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 20    }  ]}
```

### Query Order Amendments (USER\_DATA)[​](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#query-order-amendments-user_data "Direct link to Query Order Amendments (USER_DATA)")

```
{  "id": "6f5ebe91-01d9-43ac-be99-57cf062e0e30",  "method": "order.amendments",  "params": {  "orderId": "23",  "recvWindow": 5000,  "symbol": "BTCUSDT",  "timestamp": 1741925524887,  "apiKey": "N3Swv7WaBF7S2rzA12UkPunM3udJiDddbgv1W7CzFGnsQXH9H62zzSCST0CndjeE",  "signature": "0eed2e9d95b6868ea5ec21da0d14538192ef344c30ecf9fe83d58631699334dc"  }}
```

Queries all amendments of a single order.

**Weight**: 4

**Parameters:**

Name

Type

Mandatory

Description

symbol

STRING

YES

orderId

LONG

YES

fromExecutionId

LONG

NO

limit

INT

NO

Default:500; Maximum: 1000

recvWindow

DECIMAL

NO

The value cannot be greater than `60000`.  
Supports up to three decimal places of precision (e.g., 6000.346) so that microseconds may be specified.

timestamp

LONG

YES

**Data Source:** Database

**Response:**

```
{  "id": "6f5ebe91-01d9-43ac-be99-57cf062e0e30",  "status": 200,  "result":  [    {      "symbol": "BTCUSDT",      "orderId": 23,      "executionId": 60,      "origClientOrderId": "my_pending_order",      "newClientOrderId": "xbxXh5SSwaHS7oUEOCI88B",      "origQty": "7.00000000",      "newQty": "5.00000000",      "time": 1741924229819    }  ],  "rateLimits":  [    {      "rateLimitType": "REQUEST_WEIGHT",      "interval": "MINUTE",      "intervalNum": 1,      "limit": 6000,      "count": 4    }  ]}
```

### Query Relevant Filters (USER\_DATA)[​](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#query-relevant-filters-user_data "Direct link to Query Relevant Filters (USER_DATA)")

```
{  "id": "74R4febb-d142-46a2-977d-90533eb4d97g",  "method": "myFilters",  "params": {    "recvWindow": 5000,    "symbol": "BTCUSDT",    "timestamp": 1758008841149,    "apiKey": "nQ6kG5gDExDd5MZSO0MfOOWEVZmdkRllpNMfm1FjMjkMnmw1NUd3zPDfvcnDJlil",    "signature": "7edc54dd0493dd5bc47adbab9b17bfc9b378d55c20511ae5a168456d3d37aa3a"  }}
```

Retrieves the list of [filters](/docs/binance-spot-api-docs/testnet/filters) relevant to an account on a given symbol. This is the only endpoint that shows if an account has [`MAX_ASSET`](/docs/binance-spot-api-docs/testnet/filters#max_asset) filters applied to it.

**Weight:** 40

**Parameters:**

Name

Type

Mandatory

Description

symbol

STRING

YES

recvWindow

DECIMAL

NO

The value cannot be greater than `60000`.  
Supports up to three decimal places of precision (e.g., 6000.346) so that microseconds may be specified.

timestamp

LONG

YES

**Data Source:** Memory

**Response:**

```
{  "id": "1758009606869",  "status": 200,  "result": {    "exchangeFilters": [      {        "filterType": "EXCHANGE_MAX_NUM_ORDERS",        "maxNumOrders": 1000      }    ],    "symbolFilters": [      {        "filterType": "MAX_NUM_ORDER_LISTS",        "maxNumOrderLists": 20      }    ],    "assetFilters": [      {        "filterType": "MAX_ASSET",        "asset": "JPY",        "limit": "1000000.00000000"      }    ]  }}
```

-   [Account information (USER\_DATA)](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#account-information-user_data)
-   [Query order (USER\_DATA)](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#query-order-user_data)
-   [Current open orders (USER\_DATA)](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#current-open-orders-user_data)
-   [Account order history (USER\_DATA)](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#account-order-history-user_data)
-   [Query Order list (USER\_DATA)](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#query-order-list-user_data)
-   [Current open order lists (USER\_DATA)](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#current-open-order-lists-user_data)
-   [Account order list history (USER\_DATA)](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#account-order-list-history-user_data)
-   [Account trade history (USER\_DATA)](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#account-trade-history-user_data)
-   [Account unfilled order count (USER\_DATA)](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#account-unfilled-order-count-user_data)
-   [Account prevented matches (USER\_DATA)](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#account-prevented-matches-user_data)
-   [Account allocations (USER\_DATA)](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#account-allocations-user_data)
-   [Account Commission Rates (USER\_DATA)](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#account-commission-rates-user_data)
-   [Query Order Amendments (USER\_DATA)](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#query-order-amendments-user_data)
-   [Query Relevant Filters (USER\_DATA)](/docs/binance-spot-api-docs/testnet/websocket-api/account-requests#query-relevant-filters-user_data)


# User Data Stream requests | Binance Open Platform

On this page

# User Data Stream requests

### User Data Stream subscription[​](/docs/binance-spot-api-docs/testnet/websocket-api/user-data-stream-requests#user-data-stream-subscription "Direct link to User Data Stream subscription")

**General information:**

-   User Data Stream subscriptions allow you to receive all the events related to a given account on a WebSocket connection.
-   There are 2 ways to start a subscription:
    -   If you have an authenticated session, then you can subscribe to events for that authenticated account using [`userDataStream.subscribe`](/docs/binance-spot-api-docs/testnet/websocket-api/user-data-stream-requests#user-data-stream-subscribe).
    -   In any session, authenticated or not, you can subscribe to events for one or more accounts for which you can provide an API Key signature, using [`userdataStream.subscribe.signature`](/docs/binance-spot-api-docs/testnet/websocket-api/user-data-stream-requests#user-data-signature).
    -   You can have only one active subscription for a given account on a given connection.
-   Subscriptions are identified by a `subscriptionId` which is returned when starting the subscription. That `subscriptionId` allows you to map the events you receive to a given subscription.
    -   All active subscriptions for a session can be found using [`session.subscriptions`](/docs/binance-spot-api-docs/testnet/websocket-api/user-data-stream-requests#session-subscription).
-   Limits
    -   A single session supports **up to 1,000 active subscriptions** simultaneously.
        -   Attempting to start a new subscription beyond this limit will result in an error.
        -   If your accounts are very active, we suggest not opening too many subscriptions at once, in order to not overload your connection.
    -   A single session can handle a maximum of **65,535 total subscriptions** over its lifetime.
        -   If this limit is reached, you will receive an error and must re-establish a new connection to be able to start new subscriptions.
-   To verify the status of User Data Stream subscriptions, check the `userDataStream` field in [`session.status`](/docs/binance-spot-api-docs/testnet/websocket-api/authentication-requests#session-status):
    -   `null` - User Data Stream subscriptions are **not available** on this WebSocket API.
    -   `true` - There is at **least one subscription active** in this session.
    -   `false` - There are **no active subscriptions** in this session.

#### Subscribe to User Data Stream (USER\_STREAM)[​](/docs/binance-spot-api-docs/testnet/websocket-api/user-data-stream-requests#subscribe-to-user-data-stream-user_stream "Direct link to Subscribe to User Data Stream (USER_STREAM)")

```
{  "id": "d3df8a21-98ea-4fe0-8f4e-0fcea5d418b7",  "method": "userDataStream.subscribe"}
```

Subscribe to the User Data Stream in the current WebSocket connection.

**Notes:**

-   This method requires an authenticated WebSocket connection using Ed25519 keys. Please refer to [`session.logon`](/docs/binance-spot-api-docs/testnet/websocket-api/authentication-requests#session-logon).
-   To check the subscription status, use [`session.status`](/docs/binance-spot-api-docs/testnet/websocket-api/authentication-requests#session-status), see the `userDataStream` flag indicating you have have an active subscription.
-   User Data Stream events are available in both JSON and [SBE](/docs/binance-spot-api-docs/faqs/sbe_faq) sessions.
    -   Please refer to [User Data Streams](/docs/binance-spot-api-docs/testnet/user-data-stream) for the event format details.
    -   For SBE, only SBE schema 2:1 or later is supported.

**Weight**: 2

**Parameters**: NONE

**Response**:

```
{  "id": "d3df8a21-98ea-4fe0-8f4e-0fcea5d418b7",  "status": 200,  "result": {    "subscriptionId": 0  }}
```

#### Unsubscribe from User Data Stream[​](/docs/binance-spot-api-docs/testnet/websocket-api/user-data-stream-requests#unsubscribe-from-user-data-stream "Direct link to Unsubscribe from User Data Stream")

```
{  "id": "d3df8a21-98ea-4fe0-8f4e-0fcea5d418b7",  "method": "userDataStream.unsubscribe"}
```

Stop listening to the User Data Stream in the current WebSocket connection.

Note that `session.logout` will only close the subscription created with `userdataStream.subscribe` but not subscriptions opened with `userDataStream.subscribe.signature`.

**Weight**: 2

**Parameters**:

Name

Type

Mandatory

Description

`subscriptionId`

INT

No

When called with no parameter, this will close all subscriptions.  
When called with the `subscriptionId` parameter, this will attempt to close the subscription with that subscription id, if it exists.

**Response**:

```
{  "id": "d3df8a21-98ea-4fe0-8f4e-0fcea5d418b7",  "status": 200,  "result": {}}
```

#### Listing all subscriptions[​](/docs/binance-spot-api-docs/testnet/websocket-api/user-data-stream-requests#listing-all-subscriptions "Direct link to Listing all subscriptions")

```
{  "id": "d3df5a22-88ea-4fe0-9f4e-0fcea5d418b7",  "method": "session.subscriptions",  "params": {}}
```

**Note:**

-   Users are expected to track on their side which subscription corresponds to which account.

**Weight**: 2

**Data Source**: Memory

**Response**:

```
{  "id": "d3df5a22-88ea-4fe0-9f4e-0fcea5d418b7",  "status": 200,  "result": [    {      "subscriptionId": 0    },    {      "subscriptionId": 1    }  ]}
```

#### Subscribe to User Data Stream through signature subscription (USER\_STREAM)[​](/docs/binance-spot-api-docs/testnet/websocket-api/user-data-stream-requests#subscribe-to-user-data-stream-through-signature-subscription-user_stream "Direct link to Subscribe to User Data Stream through signature subscription (USER_STREAM)")

```
{  "id": "d3df8a22-98ea-4fe0-9f4e-0fcea5d418b7",  "method": "userDataStream.subscribe.signature",  "params": {    "apiKey": "mjcKCrJzTU6TChLsnPmgnQJJMR616J4yWvdZWDUeXkk6vL6dLyS7rcVOQlADlVjA",    "timestamp": 1747385641636,    "signature": "yN1vWpXb+qoZ3/dGiFs9vmpNdV7e3FxkA+BstzbezDKwObcijvk/CVkWxIwMCtCJbP270R0OempYwEpS6rDZCQ=="  }}
```

**Weight:** 2

**Parameters**:

Name

Type

Mandatory

Description

`apiKey`

STRING

Yes

`timestamp`

LONG

Yes

`signature`

STRING

Yes

**Data Source:** Memory

**Response:**

```
{  "id": "d3df8a22-98ea-4fe0-9f4e-0fcea5d418b7",  "status": 200,  "result": {    "subscriptionId": 0  }}
```

-   [User Data Stream subscription](/docs/binance-spot-api-docs/testnet/websocket-api/user-data-stream-requests#user-data-stream-subscription)


# WebSocket Streams | Binance Open Platform

On this page

# WebSocket Streams for Binance SPOT Testnet

**Last Updated: 2025-04-01**

## General WSS information[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#general-wss-information "Direct link to General WSS information")

-   The base endpoint is: **wss://stream.testnet.binance.vision/ws**.
-   Streams can be accessed either in a single raw stream or in a combined stream
-   Raw streams are accessed at **/ws/<streamName>**
-   Combined streams are accessed at **/stream?streams=<streamName1>/<streamName2>/<streamName3>**
-   Combined stream events are wrapped as follows: **{"stream":"<streamName>","data":<rawPayload>}**
-   All symbols for streams are **lowercase**
-   All time and timestamp related fields are **milliseconds by default**. To receive the information in microseconds, please add the parameter `timeUnit=MICROSECOND` or `timeUnit=microsecond` in the URL.
    -   For example: `/stream?streams=btcusdt@trade&timeUnit=MICROSECOND`
-   A single connection to **stream.binance.com** is only valid for 24 hours; expect to be disconnected at the 24 hour mark
-   The WebSocket server will send a `ping frame` every 20 seconds.
    -   If the WebSocket server does not receive a `pong frame` back from the connection within a minute, the connection will be disconnected.
    -   When you receive a ping, you must send a pong with a copy of ping's payload as soon as possible.
    -   Unsolicited `pong frames` are allowed, but will not prevent disconnection. **It is recommended that the payload for these pong frames are empty.**
-   The base endpoint **wss://data-stream.binance.vision** can be subscribed to receive **only** market data messages.  
    User data stream is **NOT** available from this URL.
-   All time and timestamp related fields are **milliseconds by default**. To receive the information in microseconds, please add the parameter `timeUnit=MICROSECOND or timeUnit=microsecond` in the URL.
    -   For example: `/stream?streams=btcusdt@trade&timeUnit=MICROSECOND`

## WebSocket Limits[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#websocket-limits "Direct link to WebSocket Limits")

-   WebSocket connections have a limit of 5 incoming messages per second. A message is considered:
    -   A PING frame
    -   A PONG frame
    -   A JSON controlled message (e.g. subscribe, unsubscribe)
-   A connection that goes beyond the limit will be disconnected; IPs that are repeatedly disconnected may be banned.
-   A single connection can listen to a maximum of 1024 streams.
-   There is a limit of **300 connections per attempt every 5 minutes per IP**.

## Live Subscribing/Unsubscribing to streams[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#live-subscribingunsubscribing-to-streams "Direct link to Live Subscribing/Unsubscribing to streams")

-   The following data can be sent through the WebSocket instance in order to subscribe/unsubscribe from streams. Examples can be seen below.
-   The `id` is used as an identifier to uniquely identify the messages going back and forth. The following formats are accepted:
    -   64-bit signed integer
    -   alphanumeric strings; max length 36
    -   `null`
-   In the response, if the `result` received is `null` this means the request sent was a success for non-query requests (e.g. Subscribing/Unsubscribing).

### Subscribe to a stream[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#subscribe-to-a-stream "Direct link to Subscribe to a stream")

-   Request
    
    ```
    {  "method": "SUBSCRIBE",  "params": [    "btcusdt@aggTrade",    "btcusdt@depth"  ],  "id": 1}
    ```
    
-   Response
    
    ```
    {  "result": null,  "id": 1}
    ```
    

### Unsubscribe to a stream[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#unsubscribe-to-a-stream "Direct link to Unsubscribe to a stream")

-   Request
    
    ```
    {  "method": "UNSUBSCRIBE",  "params": [    "btcusdt@depth"  ],  "id": 312}
    ```
    
-   Response
    
    ```
    {  "result": null,  "id": 312}
    ```
    

### Listing Subscriptions[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#listing-subscriptions "Direct link to Listing Subscriptions")

-   Request
    
    ```
    {  "method": "LIST_SUBSCRIPTIONS",  "id": 3}
    ```
    
-   Response
    
    ```
    {  "result": [    "btcusdt@aggTrade"  ],  "id": 3}
    ```
    

### Setting Properties[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#setting-properties "Direct link to Setting Properties")

Currently, the only property that can be set is whether `combined` stream payloads are enabled or not. The combined property is set to `false` when connecting using `/ws/` ("raw streams") and `true` when connecting using `/stream/`.

-   Request
    
    ```
    {  "method": "SET_PROPERTY",  "params": [    "combined",    true  ],  "id": 5}
    ```
    
-   Response
    
    ```
    {  "result": null,  "id": 5}
    ```
    

### Retrieving Properties[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#retrieving-properties "Direct link to Retrieving Properties")

-   Request
    
    ```
    {  "method": "GET_PROPERTY",  "params": [    "combined"  ],  "id": 2}
    ```
    
-   Response
    
    ```
    {  "result": true, // Indicates that combined is set to true.  "id": 2}
    ```
    

### Error Messages[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#error-messages "Direct link to Error Messages")

Error Message

Description

{"code": 0, "msg": "Unknown property","id": %s}

Parameter used in the `SET_PROPERTY` or `GET_PROPERTY` was invalid

{"code": 1, "msg": "Invalid value type: expected Boolean"}

Value should only be `true` or `false`

{"code": 2, "msg": "Invalid request: property name must be a string"}

Property name provided was invalid

{"code": 2, "msg": "Invalid request: request ID must be an unsigned integer"}

Parameter `id` had to be provided or the value provided in the `id` parameter is an unsupported type

{"code": 2, "msg": "Invalid request: unknown variant %s, expected one of `SUBSCRIBE`, `UNSUBSCRIBE`, `LIST_SUBSCRIPTIONS`, `SET_PROPERTY`, `GET_PROPERTY` at line 1 column 28"}

Possible typo in the provided method or provided method was neither of the expected values

{"code": 2, "msg": "Invalid request: too many parameters"}

Unnecessary parameters provided in the data

{"code": 2, "msg": "Invalid request: property name must be a string"}

Property name was not provided

{"code": 2, "msg": "Invalid request: missing field `method` at line 1 column 73"}

`method` was not provided in the data

{"code":3,"msg":"Invalid JSON: expected value at line %s column %s"}

JSON data sent has incorrect syntax.

# Detailed Stream information

## Aggregate Trade Streams[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#aggregate-trade-streams "Direct link to Aggregate Trade Streams")

The Aggregate Trade Streams push trade information that is aggregated for a single taker order.

**Stream Name:** <symbol>@aggTrade

**Update Speed:** Real-time

**Payload:**

```
{  "e": "aggTrade",    // Event type  "E": 1672515782136, // Event time  "s": "BNBBTC",      // Symbol  "a": 12345,         // Aggregate trade ID  "p": "0.001",       // Price  "q": "100",         // Quantity  "f": 100,           // First trade ID  "l": 105,           // Last trade ID  "T": 1672515782136, // Trade time  "m": true,          // Is the buyer the market maker?  "M": true           // Ignore}
```

## Trade Streams[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#trade-streams "Direct link to Trade Streams")

The Trade Streams push raw trade information; each trade has a unique buyer and seller.

**Stream Name:** <symbol>@trade

**Update Speed:** Real-time

**Payload:**

```
{  "e": "trade",       // Event type  "E": 1672515782136, // Event time  "s": "BNBBTC",      // Symbol  "t": 12345,         // Trade ID  "p": "0.001",       // Price  "q": "100",         // Quantity  "T": 1672515782136, // Trade time  "m": true,          // Is the buyer the market maker?  "M": true           // Ignore}
```

## Kline/Candlestick Streams for UTC[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#klinecandlestick-streams-for-utc "Direct link to Kline/Candlestick Streams for UTC")

The Kline/Candlestick Stream push updates to the current klines/candlestick every second in `UTC+0` timezone.

**Kline/Candlestick chart intervals:**

s-> seconds; m -> minutes; h -> hours; d -> days; w -> weeks; M -> months

-   1s
-   1m
-   3m
-   5m
-   15m
-   30m
-   1h
-   2h
-   4h
-   6h
-   8h
-   12h
-   1d
-   3d
-   1w
-   1M

**Stream Name:** <symbol>@kline\_<interval>

**Update Speed:** 1000ms for `1s`, 2000ms for the other intervals

**Payload:**

```
{  "e": "kline",         // Event type  "E": 1672515782136,   // Event time  "s": "BNBBTC",        // Symbol  "k": {    "t": 1672515780000, // Kline start time    "T": 1672515839999, // Kline close time    "s": "BNBBTC",      // Symbol    "i": "1m",          // Interval    "f": 100,           // First trade ID    "L": 200,           // Last trade ID    "o": "0.0010",      // Open price    "c": "0.0020",      // Close price    "h": "0.0025",      // High price    "l": "0.0015",      // Low price    "v": "1000",        // Base asset volume    "n": 100,           // Number of trades    "x": false,         // Is this kline closed?    "q": "1.0000",      // Quote asset volume    "V": "500",         // Taker buy base asset volume    "Q": "0.500",       // Taker buy quote asset volume    "B": "123456"       // Ignore  }}
```

## Kline/Candlestick Streams with timezone offset[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#klinecandlestick-streams-with-timezone-offset "Direct link to Kline/Candlestick Streams with timezone offset")

The Kline/Candlestick Stream push updates to the current klines/candlestick every second in `UTC+8` timezone.

**Kline/Candlestick chart intervals:** Supported intervals: See [`Kline/Candlestick chart intervals`](/docs/binance-spot-api-docs/testnet/web-socket-streams#kline-intervals)

**UTC+8 timezone offset:**

-   Kline intervals open and close in the `UTC+8` timezone. For example the `1d` klines will open at the beginning of the `UTC+8` day, and close at the end of the `UTC+8` day.
-   Note that `E` (event time), `t` (start time), and `T` (close time) in the payload are Unix timestamps, which are always interpreted in UTC.

**Stream Name:** <symbol>@kline\_<interval>@+08:00

**Update Speed:** 1000ms for `1s`, 2000ms for the other intervals

**Payload:**

```
{  "e": "kline",         // Event type  "E": 1672515782136,   // Event time  "s": "BNBBTC",        // Symbol  "k": {    "t": 1672515780000, // Kline start time    "T": 1672515839999, // Kline close time    "s": "BNBBTC",      // Symbol    "i": "1m",          // Interval    "f": 100,           // First trade ID    "L": 200,           // Last trade ID    "o": "0.0010",      // Open price    "c": "0.0020",      // Close price    "h": "0.0025",      // High price    "l": "0.0015",      // Low price    "v": "1000",        // Base asset volume    "n": 100,           // Number of trades    "x": false,         // Is this kline closed?    "q": "1.0000",      // Quote asset volume    "V": "500",         // Taker buy base asset volume    "Q": "0.500",       // Taker buy quote asset volume    "B": "123456"       // Ignore  }}
```

## Individual Symbol Mini Ticker Stream[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#individual-symbol-mini-ticker-stream "Direct link to Individual Symbol Mini Ticker Stream")

24hr rolling window mini-ticker statistics. These are NOT the statistics of the UTC day, but a 24hr rolling window for the previous 24hrs.

**Stream Name:** <symbol>@miniTicker

**Update Speed:** 1000ms

**Payload:**

```
  {    "e": "24hrMiniTicker",  // Event type    "E": 1672515782136,     // Event time    "s": "BNBBTC",          // Symbol    "c": "0.0025",          // Close price    "o": "0.0010",          // Open price    "h": "0.0025",          // High price    "l": "0.0010",          // Low price    "v": "10000",           // Total traded base asset volume    "q": "18"               // Total traded quote asset volume  }
```

## All Market Mini Tickers Stream[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#all-market-mini-tickers-stream "Direct link to All Market Mini Tickers Stream")

24hr rolling window mini-ticker statistics for all symbols that changed in an array. These are NOT the statistics of the UTC day, but a 24hr rolling window for the previous 24hrs. Note that only tickers that have changed will be present in the array.

**Stream Name:** !miniTicker@arr

**Update Speed:** 1000ms

**Payload:**

```
[  {    // Same as <symbol>@miniTicker payload  }]
```

## Individual Symbol Ticker Streams[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#individual-symbol-ticker-streams "Direct link to Individual Symbol Ticker Streams")

24hr rolling window ticker statistics for a single symbol. These are NOT the statistics of the UTC day, but a 24hr rolling window for the previous 24hrs.

**Stream Name:** <symbol>@ticker

**Update Speed:** 1000ms

**Payload:**

```
{  "e": "24hrTicker",  // Event type  "E": 1672515782136, // Event time  "s": "BNBBTC",      // Symbol  "p": "0.0015",      // Price change  "P": "250.00",      // Price change percent  "w": "0.0018",      // Weighted average price  "x": "0.0009",      // First trade(F)-1 price (first trade before the 24hr rolling window)  "c": "0.0025",      // Last price  "Q": "10",          // Last quantity  "b": "0.0024",      // Best bid price  "B": "10",          // Best bid quantity  "a": "0.0026",      // Best ask price  "A": "100",         // Best ask quantity  "o": "0.0010",      // Open price  "h": "0.0025",      // High price  "l": "0.0010",      // Low price  "v": "10000",       // Total traded base asset volume  "q": "18",          // Total traded quote asset volume  "O": 0,             // Statistics open time  "C": 86400000,      // Statistics close time  "F": 0,             // First trade ID  "L": 18150,         // Last trade Id  "n": 18151          // Total number of trades}
```

## All Market Tickers Stream[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#all-market-tickers-stream "Direct link to All Market Tickers Stream")

24hr rolling window ticker statistics for all symbols that changed in an array. These are NOT the statistics of the UTC day, but a 24hr rolling window for the previous 24hrs. Note that only tickers that have changed will be present in the array.

**Stream Name:** !ticker@arr

**Update Speed:** 1000ms

**Payload:**

```
[  {    // Same as <symbol>@ticker payload  }]
```

## Individual Symbol Rolling Window Statistics Streams[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#individual-symbol-rolling-window-statistics-streams "Direct link to Individual Symbol Rolling Window Statistics Streams")

Rolling window ticker statistics for a single symbol, computed over multiple windows.

**Stream Name:** <symbol>@ticker\_<window\_size>

**Window Sizes:** 1h,4h,1d

**Update Speed:** 1000ms

**Note**: This stream is different from the <symbol>@ticker stream. The open time `O` always starts on a minute, while the closing time `C` is the current time of the update. As such, the effective window might be up to 59999ms wider that <window\_size>.

**Payload:**

```
{  "e": "1hTicker",    // Event type  "E": 1672515782136, // Event time  "s": "BNBBTC",      // Symbol  "p": "0.0015",      // Price change  "P": "250.00",      // Price change percent  "o": "0.0010",      // Open price  "h": "0.0025",      // High price  "l": "0.0010",      // Low price  "c": "0.0025",      // Last price  "w": "0.0018",      // Weighted average price  "v": "10000",       // Total traded base asset volume  "q": "18",          // Total traded quote asset volume  "O": 0,             // Statistics open time  "C": 1675216573749, // Statistics close time  "F": 0,             // First trade ID  "L": 18150,         // Last trade Id  "n": 18151          // Total number of trades}
```

## All Market Rolling Window Statistics Streams[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#all-market-rolling-window-statistics-streams "Direct link to All Market Rolling Window Statistics Streams")

Rolling window ticker statistics for all market symbols, computed over multiple windows. Note that only tickers that have changed will be present in the array.

**Stream Name:** !ticker\_<window-size>@arr

**Window Size:** 1h,4h,1d

**Update Speed:** 1000ms

**Payload:**

```
[  {    // Same as <symbol>@ticker_<window-size> payload,    // one for each symbol updated within the interval.  }]
```

## Individual Symbol Book Ticker Streams[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#individual-symbol-book-ticker-streams "Direct link to Individual Symbol Book Ticker Streams")

Pushes any update to the best bid or ask's price or quantity in real-time for a specified symbol. Multiple `<symbol>@bookTicker` streams can be subscribed to over one connection.

**Stream Name:** <symbol>@bookTicker

**Update Speed:** Real-time

**Payload:**

```
{  "u":400900217,     // order book updateId  "s":"BNBUSDT",     // symbol  "b":"25.35190000", // best bid price  "B":"31.21000000", // best bid qty  "a":"25.36520000", // best ask price  "A":"40.66000000"  // best ask qty}
```

## Average Price[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#average-price "Direct link to Average Price")

Average price streams push changes in the average price over a fixed time interval.

**Stream Name:** <symbol>@avgPrice

**Update Speed:** 1000ms

**Payload:**

```
{  "e": "avgPrice",          // Event type  "E": 1693907033000,       // Event time  "s": "BTCUSDT",           // Symbol  "i": "5m",                // Average price interval  "w": "25776.86000000",    // Average price  "T": 1693907032213        // Last trade time}
```

## Partial Book Depth Streams[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#partial-book-depth-streams "Direct link to Partial Book Depth Streams")

Top **<levels>** bids and asks, pushed every second. Valid **<levels>** are 5, 10, or 20.

**Stream Names:** <symbol>@depth<levels> OR <symbol>@depth<levels>@100ms

**Update Speed:** 1000ms or 100ms

**Payload:**

```
{  "lastUpdateId": 160,  // Last update ID  "bids": [             // Bids to be updated    [      "0.0024",         // Price level to be updated      "10"              // Quantity    ]  ],  "asks": [             // Asks to be updated    [      "0.0026",         // Price level to be updated      "100"             // Quantity    ]  ]}
```

## Diff. Depth Stream[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#diff-depth-stream "Direct link to Diff. Depth Stream")

Order book price and quantity depth updates used to locally manage an order book.

**Stream Name:** <symbol>@depth OR <symbol>@depth@100ms

**Update Speed:** 1000ms or 100ms

**Payload:**

```
{  "e": "depthUpdate", // Event type  "E": 1672515782136, // Event time  "s": "BNBBTC",      // Symbol  "U": 157,           // First update ID in event  "u": 160,           // Final update ID in event  "b": [              // Bids to be updated    [      "0.0024",       // Price level to be updated      "10"            // Quantity    ]  ],  "a": [              // Asks to be updated    [      "0.0026",       // Price level to be updated      "100"           // Quantity    ]  ]}
```

## How to manage a local order book correctly[​](/docs/binance-spot-api-docs/testnet/web-socket-streams#how-to-manage-a-local-order-book-correctly "Direct link to How to manage a local order book correctly")

1.  Open a WebSocket connection to `wss://stream.testnet.binance.vision:9443/ws/bnbbtc@depth`.
2.  Buffer the events received from the stream. Note the `U` of the first event you received.
3.  Get a depth snapshot from `https://testnet.binance.vision/api/v3/depth?symbol=BNBBTC&limit=5000`.
4.  If the `lastUpdateId` from the snapshot is strictly less than the `U` from step 2, go back to step 3.
5.  In the buffered events, discard any event where `u` is <= `lastUpdateId` of the snapshot. The first buffered event should now have `lastUpdateId` within its `[U;u]` range.
6.  Set your local order book to the snapshot. Its update ID is `lastUpdateId`.
7.  Apply the update procedure below to all buffered events, and then to all subsequent events received.

To apply an event to your local order book, follow this update procedure:

1.  If the event `u` (last update ID) is < the update ID of your local order book, ignore the event.
2.  If the event `U` (first update ID) is > the update ID of your local order book, something went wrong. Discard your local order book and restart the process from the beginning.
3.  For each price level in bids (`b`) and asks (`a`), set the new quantity in the order book:
    -   If the price level does not exist in the order book, insert it with new quantity.
    -   If the quantity is zero, remove the price level from the order book.
4.  Set the order book update ID to the last update ID (`u`) in the processed event.

> \[!NOTE\] Since depth snapshots retrieved from the API have a limit on the number of price levels (5000 on each side maximum), you won't learn the quantities for the levels outside of the initial snapshot unless they change.  
> So be careful when using the information for those levels, since they might not reflect the full view of the order book.  
> However, for most use cases, seeing 5000 levels on each side is enough to understand the market and trade effectively.

-   [General WSS information](/docs/binance-spot-api-docs/testnet/web-socket-streams#general-wss-information)
-   [WebSocket Limits](/docs/binance-spot-api-docs/testnet/web-socket-streams#websocket-limits)
-   [Live Subscribing/Unsubscribing to streams](/docs/binance-spot-api-docs/testnet/web-socket-streams#live-subscribingunsubscribing-to-streams)
    -   [Subscribe to a stream](/docs/binance-spot-api-docs/testnet/web-socket-streams#subscribe-to-a-stream)
    -   [Unsubscribe to a stream](/docs/binance-spot-api-docs/testnet/web-socket-streams#unsubscribe-to-a-stream)
    -   [Listing Subscriptions](/docs/binance-spot-api-docs/testnet/web-socket-streams#listing-subscriptions)
    -   [Setting Properties](/docs/binance-spot-api-docs/testnet/web-socket-streams#setting-properties)
    -   [Retrieving Properties](/docs/binance-spot-api-docs/testnet/web-socket-streams#retrieving-properties)
    -   [Error Messages](/docs/binance-spot-api-docs/testnet/web-socket-streams#error-messages)
-   [Aggregate Trade Streams](/docs/binance-spot-api-docs/testnet/web-socket-streams#aggregate-trade-streams)
-   [Trade Streams](/docs/binance-spot-api-docs/testnet/web-socket-streams#trade-streams)
-   [Kline/Candlestick Streams for UTC](/docs/binance-spot-api-docs/testnet/web-socket-streams#klinecandlestick-streams-for-utc)
-   [Kline/Candlestick Streams with timezone offset](/docs/binance-spot-api-docs/testnet/web-socket-streams#klinecandlestick-streams-with-timezone-offset)
-   [Individual Symbol Mini Ticker Stream](/docs/binance-spot-api-docs/testnet/web-socket-streams#individual-symbol-mini-ticker-stream)
-   [All Market Mini Tickers Stream](/docs/binance-spot-api-docs/testnet/web-socket-streams#all-market-mini-tickers-stream)
-   [Individual Symbol Ticker Streams](/docs/binance-spot-api-docs/testnet/web-socket-streams#individual-symbol-ticker-streams)
-   [All Market Tickers Stream](/docs/binance-spot-api-docs/testnet/web-socket-streams#all-market-tickers-stream)
-   [Individual Symbol Rolling Window Statistics Streams](/docs/binance-spot-api-docs/testnet/web-socket-streams#individual-symbol-rolling-window-statistics-streams)
-   [All Market Rolling Window Statistics Streams](/docs/binance-spot-api-docs/testnet/web-socket-streams#all-market-rolling-window-statistics-streams)
-   [Individual Symbol Book Ticker Streams](/docs/binance-spot-api-docs/testnet/web-socket-streams#individual-symbol-book-ticker-streams)
-   [Average Price](/docs/binance-spot-api-docs/testnet/web-socket-streams#average-price)
-   [Partial Book Depth Streams](/docs/binance-spot-api-docs/testnet/web-socket-streams#partial-book-depth-streams)
-   [Diff. Depth Stream](/docs/binance-spot-api-docs/testnet/web-socket-streams#diff-depth-stream)
-   [How to manage a local order book correctly](/docs/binance-spot-api-docs/testnet/web-socket-streams#how-to-manage-a-local-order-book-correctly)


# WebSocket Streams | Binance Open Platform

On this page

# WebSocket Streams for Binance (2025-01-28)

## General WSS information[​](/docs/binance-spot-api-docs/web-socket-streams#general-wss-information "Direct link to General WSS information")

-   The base endpoint is: **wss://stream.binance.com:9443** or **wss://stream.binance.com:443**.
-   Streams can be accessed either in a single raw stream or in a combined stream.
-   Raw streams are accessed at **/ws/<streamName>**
-   Combined streams are accessed at **/stream?streams=<streamName1>/<streamName2>/<streamName3>**
-   Combined stream events are wrapped as follows: **{"stream":"<streamName>","data":<rawPayload>}**
-   All symbols for streams are **lowercase**
-   A single connection to **stream.binance.com** is only valid for 24 hours; expect to be disconnected at the 24 hour mark
-   The WebSocket server will send a `ping frame` every 20 seconds.
    -   If the WebSocket server does not receive a `pong frame` back from the connection within a minute the connection will be disconnected.
    -   When you receive a ping, you must send a pong with a copy of ping's payload as soon as possible.
    -   Unsolicited `pong frames` are allowed, but will not prevent disconnection. **It is recommended that the payload for these pong frames are empty.**
-   The base endpoint **wss://data-stream.binance.vision** can be subscribed to receive **only** market data messages.  
    User data stream is **NOT** available from this URL.
-   All time and timestamp related fields are **milliseconds by default**. To receive the information in microseconds, please add the parameter `timeUnit=MICROSECOND or timeUnit=microsecond` in the URL.
    -   For example: `/stream?streams=btcusdt@trade&timeUnit=MICROSECOND`

## WebSocket Limits[​](/docs/binance-spot-api-docs/web-socket-streams#websocket-limits "Direct link to WebSocket Limits")

-   WebSocket connections have a limit of 5 incoming messages per second. A message is considered:
    -   A PING frame
    -   A PONG frame
    -   A JSON controlled message (e.g. subscribe, unsubscribe)
-   A connection that goes beyond the limit will be disconnected; IPs that are repeatedly disconnected may be banned.
-   A single connection can listen to a maximum of 1024 streams.
-   There is a limit of **300 connections per attempt every 5 minutes per IP**.

## Live Subscribing/Unsubscribing to streams[​](/docs/binance-spot-api-docs/web-socket-streams#live-subscribingunsubscribing-to-streams "Direct link to Live Subscribing/Unsubscribing to streams")

-   The following data can be sent through the WebSocket instance in order to subscribe/unsubscribe from streams. Examples can be seen below.
-   The `id` is used as an identifier to uniquely identify the messages going back and forth. The following formats are accepted:
    -   64-bit signed integer
    -   alphanumeric strings; max length 36
    -   `null`
-   In the response, if the `result` received is `null` this means the request sent was a success for non-query requests (e.g. Subscribing/Unsubscribing).

### Subscribe to a stream[​](/docs/binance-spot-api-docs/web-socket-streams#subscribe-to-a-stream "Direct link to Subscribe to a stream")

-   Request
    
    ```
    {  "method": "SUBSCRIBE",  "params": [    "btcusdt@aggTrade",    "btcusdt@depth"  ],  "id": 1}
    ```
    
-   Response
    
    ```
    {  "result": null,  "id": 1}
    ```
    

### Unsubscribe to a stream[​](/docs/binance-spot-api-docs/web-socket-streams#unsubscribe-to-a-stream "Direct link to Unsubscribe to a stream")

-   Request
    
    ```
    {  "method": "UNSUBSCRIBE",  "params": [    "btcusdt@depth"  ],  "id": 312}
    ```
    
-   Response
    
    ```
    {  "result": null,  "id": 312}
    ```
    

### Listing Subscriptions[​](/docs/binance-spot-api-docs/web-socket-streams#listing-subscriptions "Direct link to Listing Subscriptions")

-   Request
    
    ```
    {  "method": "LIST_SUBSCRIPTIONS",  "id": 3}
    ```
    
-   Response
    
    ```
    {  "result": [    "btcusdt@aggTrade"  ],  "id": 3}
    ```
    

### Setting Properties[​](/docs/binance-spot-api-docs/web-socket-streams#setting-properties "Direct link to Setting Properties")

Currently, the only property that can be set is whether `combined` stream payloads are enabled or not. The combined property is set to `false` when connecting using `/ws/` ("raw streams") and `true` when connecting using `/stream/`.

-   Request
    
    ```
    {  "method": "SET_PROPERTY",  "params": [    "combined",    true  ],  "id": 5}
    ```
    
-   Response
    
    ```
    {  "result": null,  "id": 5}
    ```
    

### Retrieving Properties[​](/docs/binance-spot-api-docs/web-socket-streams#retrieving-properties "Direct link to Retrieving Properties")

-   Request
    
    ```
    {  "method": "GET_PROPERTY",  "params": [    "combined"  ],  "id": 2}
    ```
    
-   Response
    
    ```
    {  "result": true, // Indicates that combined is set to true.  "id": 2}
    ```
    

### Error Messages[​](/docs/binance-spot-api-docs/web-socket-streams#error-messages "Direct link to Error Messages")

Error Message

Description

{"code": 0, "msg": "Unknown property","id": %s}

Parameter used in the `SET_PROPERTY` or `GET_PROPERTY` was invalid

{"code": 1, "msg": "Invalid value type: expected Boolean"}

Value should only be `true` or `false`

{"code": 2, "msg": "Invalid request: property name must be a string"}

Property name provided was invalid

{"code": 2, "msg": "Invalid request: request ID must be an unsigned integer"}

Parameter `id` had to be provided or the value provided in the `id` parameter is an unsupported type

{"code": 2, "msg": "Invalid request: unknown variant %s, expected one of `SUBSCRIBE`, `UNSUBSCRIBE`, `LIST_SUBSCRIPTIONS`, `SET_PROPERTY`, `GET_PROPERTY` at line 1 column 28"}

Possible typo in the provided method or provided method was neither of the expected values

{"code": 2, "msg": "Invalid request: too many parameters"}

Unnecessary parameters provided in the data

{"code": 2, "msg": "Invalid request: property name must be a string"}

Property name was not provided

{"code": 2, "msg": "Invalid request: missing field `method` at line 1 column 73"}

`method` was not provided in the data

{"code":3,"msg":"Invalid JSON: expected value at line %s column %s"}

JSON data sent has incorrect syntax.

# Detailed Stream information

## Aggregate Trade Streams[​](/docs/binance-spot-api-docs/web-socket-streams#aggregate-trade-streams "Direct link to Aggregate Trade Streams")

The Aggregate Trade Streams push trade information that is aggregated for a single taker order.

**Stream Name:** <symbol>@aggTrade

**Update Speed:** Real-time

**Payload:**

```
{  "e": "aggTrade",    // Event type  "E": 1672515782136, // Event time  "s": "BNBBTC",      // Symbol  "a": 12345,         // Aggregate trade ID  "p": "0.001",       // Price  "q": "100",         // Quantity  "f": 100,           // First trade ID  "l": 105,           // Last trade ID  "T": 1672515782136, // Trade time  "m": true,          // Is the buyer the market maker?  "M": true           // Ignore}
```

## Trade Streams[​](/docs/binance-spot-api-docs/web-socket-streams#trade-streams "Direct link to Trade Streams")

The Trade Streams push raw trade information; each trade has a unique buyer and seller.

**Stream Name:** <symbol>@trade

**Update Speed:** Real-time

**Payload:**

```
{  "e": "trade",       // Event type  "E": 1672515782136, // Event time  "s": "BNBBTC",      // Symbol  "t": 12345,         // Trade ID  "p": "0.001",       // Price  "q": "100",         // Quantity  "T": 1672515782136, // Trade time  "m": true,          // Is the buyer the market maker?  "M": true           // Ignore}
```

## Kline/Candlestick Streams for UTC[​](/docs/binance-spot-api-docs/web-socket-streams#klinecandlestick-streams-for-utc "Direct link to Kline/Candlestick Streams for UTC")

The Kline/Candlestick Stream push updates to the current klines/candlestick every second in `UTC+0` timezone

**Kline/Candlestick chart intervals:**

s-> seconds; m -> minutes; h -> hours; d -> days; w -> weeks; M -> months

-   1s
-   1m
-   3m
-   5m
-   15m
-   30m
-   1h
-   2h
-   4h
-   6h
-   8h
-   12h
-   1d
-   3d
-   1w
-   1M

**Stream Name:** <symbol>@kline\_<interval>

**Update Speed:** 1000ms for `1s`, 2000ms for the other intervals

**Payload:**

```
{  "e": "kline",         // Event type  "E": 1672515782136,   // Event time  "s": "BNBBTC",        // Symbol  "k": {    "t": 1672515780000, // Kline start time    "T": 1672515839999, // Kline close time    "s": "BNBBTC",      // Symbol    "i": "1m",          // Interval    "f": 100,           // First trade ID    "L": 200,           // Last trade ID    "o": "0.0010",      // Open price    "c": "0.0020",      // Close price    "h": "0.0025",      // High price    "l": "0.0015",      // Low price    "v": "1000",        // Base asset volume    "n": 100,           // Number of trades    "x": false,         // Is this kline closed?    "q": "1.0000",      // Quote asset volume    "V": "500",         // Taker buy base asset volume    "Q": "0.500",       // Taker buy quote asset volume    "B": "123456"       // Ignore  }}
```

## Kline/Candlestick Streams with timezone offset[​](/docs/binance-spot-api-docs/web-socket-streams#klinecandlestick-streams-with-timezone-offset "Direct link to Kline/Candlestick Streams with timezone offset")

The Kline/Candlestick Stream push updates to the current klines/candlestick every second in `UTC+8` timezone

**Kline/Candlestick chart intervals:**

Supported intervals: See [`Kline/Candlestick chart intervals`](/docs/binance-spot-api-docs/web-socket-streams#kline-intervals)

**UTC+8 timezone offset:**

-   Kline intervals open and close in the `UTC+8` timezone. For example the `1d` klines will open at the beginning of the `UTC+8` day, and close at the end of the `UTC+8` day.
-   Note that `E` (event time), `t` (start time) and `T` (close time) in the payload are Unix timestamps, which are always interpreted in UTC.

**Stream Name:** <symbol>@kline\_<interval>@+08:00

**Update Speed:** 1000ms for `1s`, 2000ms for the other intervals

**Payload:**

```
{  "e": "kline",         // Event type  "E": 1672515782136,   // Event time  "s": "BNBBTC",        // Symbol  "k": {    "t": 1672515780000, // Kline start time    "T": 1672515839999, // Kline close time    "s": "BNBBTC",      // Symbol    "i": "1m",          // Interval    "f": 100,           // First trade ID    "L": 200,           // Last trade ID    "o": "0.0010",      // Open price    "c": "0.0020",      // Close price    "h": "0.0025",      // High price    "l": "0.0015",      // Low price    "v": "1000",        // Base asset volume    "n": 100,           // Number of trades    "x": false,         // Is this kline closed?    "q": "1.0000",      // Quote asset volume    "V": "500",         // Taker buy base asset volume    "Q": "0.500",       // Taker buy quote asset volume    "B": "123456"       // Ignore  }}
```

## Individual Symbol Mini Ticker Stream[​](/docs/binance-spot-api-docs/web-socket-streams#individual-symbol-mini-ticker-stream "Direct link to Individual Symbol Mini Ticker Stream")

24hr rolling window mini-ticker statistics. These are NOT the statistics of the UTC day, but a 24hr rolling window for the previous 24hrs.

**Stream Name:** <symbol>@miniTicker

**Update Speed:** 1000ms

**Payload:**

```
  {    "e": "24hrMiniTicker",  // Event type    "E": 1672515782136,     // Event time    "s": "BNBBTC",          // Symbol    "c": "0.0025",          // Close price    "o": "0.0010",          // Open price    "h": "0.0025",          // High price    "l": "0.0010",          // Low price    "v": "10000",           // Total traded base asset volume    "q": "18"               // Total traded quote asset volume  }
```

## All Market Mini Tickers Stream[​](/docs/binance-spot-api-docs/web-socket-streams#all-market-mini-tickers-stream "Direct link to All Market Mini Tickers Stream")

24hr rolling window mini-ticker statistics for all symbols that changed in an array. These are NOT the statistics of the UTC day, but a 24hr rolling window for the previous 24hrs. Note that only tickers that have changed will be present in the array.

**Stream Name:** !miniTicker@arr

**Update Speed:** 1000ms

**Payload:**

```
[  {    // Same as <symbol>@miniTicker payload  }]
```

## Individual Symbol Ticker Streams[​](/docs/binance-spot-api-docs/web-socket-streams#individual-symbol-ticker-streams "Direct link to Individual Symbol Ticker Streams")

24hr rolling window ticker statistics for a single symbol. These are NOT the statistics of the UTC day, but a 24hr rolling window for the previous 24hrs.

**Stream Name:** <symbol>@ticker

**Update Speed:** 1000ms

**Payload:**

```
{  "e": "24hrTicker",  // Event type  "E": 1672515782136, // Event time  "s": "BNBBTC",      // Symbol  "p": "0.0015",      // Price change  "P": "250.00",      // Price change percent  "w": "0.0018",      // Weighted average price  "x": "0.0009",      // First trade(F)-1 price (first trade before the 24hr rolling window)  "c": "0.0025",      // Last price  "Q": "10",          // Last quantity  "b": "0.0024",      // Best bid price  "B": "10",          // Best bid quantity  "a": "0.0026",      // Best ask price  "A": "100",         // Best ask quantity  "o": "0.0010",      // Open price  "h": "0.0025",      // High price  "l": "0.0010",      // Low price  "v": "10000",       // Total traded base asset volume  "q": "18",          // Total traded quote asset volume  "O": 0,             // Statistics open time  "C": 86400000,      // Statistics close time  "F": 0,             // First trade ID  "L": 18150,         // Last trade Id  "n": 18151          // Total number of trades}
```

## All Market Tickers Stream[​](/docs/binance-spot-api-docs/web-socket-streams#all-market-tickers-stream "Direct link to All Market Tickers Stream")

24hr rolling window ticker statistics for all symbols that changed in an array. These are NOT the statistics of the UTC day, but a 24hr rolling window for the previous 24hrs. Note that only tickers that have changed will be present in the array.

**Stream Name:** !ticker@arr

**Update Speed:** 1000ms

**Payload:**

```
[  {    // Same as <symbol>@ticker payload  }]
```

## Individual Symbol Rolling Window Statistics Streams[​](/docs/binance-spot-api-docs/web-socket-streams#individual-symbol-rolling-window-statistics-streams "Direct link to Individual Symbol Rolling Window Statistics Streams")

Rolling window ticker statistics for a single symbol, computed over multiple windows.

**Stream Name:** <symbol>@ticker\_<window\_size>

**Window Sizes:** 1h,4h,1d

**Update Speed:** 1000ms

**Note**: This stream is different from the <symbol>@ticker stream. The open time `"O"` always starts on a minute, while the closing time `"C"` is the current time of the update. As such, the effective window might be up to 59999ms wider than <window\_size>.

**Payload:**

```
{  "e": "1hTicker",    // Event type  "E": 1672515782136, // Event time  "s": "BNBBTC",      // Symbol  "p": "0.0015",      // Price change  "P": "250.00",      // Price change percent  "o": "0.0010",      // Open price  "h": "0.0025",      // High price  "l": "0.0010",      // Low price  "c": "0.0025",      // Last price  "w": "0.0018",      // Weighted average price  "v": "10000",       // Total traded base asset volume  "q": "18",          // Total traded quote asset volume  "O": 0,             // Statistics open time  "C": 1675216573749, // Statistics close time  "F": 0,             // First trade ID  "L": 18150,         // Last trade Id  "n": 18151          // Total number of trades}
```

## All Market Rolling Window Statistics Streams[​](/docs/binance-spot-api-docs/web-socket-streams#all-market-rolling-window-statistics-streams "Direct link to All Market Rolling Window Statistics Streams")

Rolling window ticker statistics for all market symbols, computed over multiple windows. Note that only tickers that have changed will be present in the array.

**Stream Name:** !ticker\_<window-size>@arr

**Window Size:** 1h,4h,1d

**Update Speed:** 1000ms

**Payload:**

```
[  {    // Same as <symbol>@ticker_<window_size> payload,    // one for each symbol updated within the interval.  }]
```

## Individual Symbol Book Ticker Streams[​](/docs/binance-spot-api-docs/web-socket-streams#individual-symbol-book-ticker-streams "Direct link to Individual Symbol Book Ticker Streams")

Pushes any update to the best bid or ask's price or quantity in real-time for a specified symbol. Multiple `<symbol>@bookTicker` streams can be subscribed to over one connection.

**Stream Name:** <symbol>@bookTicker

**Update Speed:** Real-time

**Payload:**

```
{  "u":400900217,     // order book updateId  "s":"BNBUSDT",     // symbol  "b":"25.35190000", // best bid price  "B":"31.21000000", // best bid qty  "a":"25.36520000", // best ask price  "A":"40.66000000"  // best ask qty}
```

## Average Price[​](/docs/binance-spot-api-docs/web-socket-streams#average-price "Direct link to Average Price")

Average price streams push changes in the average price over a fixed time interval.

**Stream Name:** <symbol>@avgPrice

**Update Speed:** 1000ms

**Payload:**

```
{  "e": "avgPrice",          // Event type  "E": 1693907033000,       // Event time  "s": "BTCUSDT",           // Symbol  "i": "5m",                // Average price interval  "w": "25776.86000000",    // Average price  "T": 1693907032213        // Last trade time}
```

## Partial Book Depth Streams[​](/docs/binance-spot-api-docs/web-socket-streams#partial-book-depth-streams "Direct link to Partial Book Depth Streams")

Top **<levels>** bids and asks, pushed every second. Valid **<levels>** are 5, 10, or 20.

**Stream Names:** <symbol>@depth<levels> OR <symbol>@depth<levels>@100ms

**Update Speed:** 1000ms or 100ms

**Payload:**

```
{  "lastUpdateId": 160,  // Last update ID  "bids": [             // Bids to be updated    [      "0.0024",         // Price level to be updated      "10"              // Quantity    ]  ],  "asks": [             // Asks to be updated    [      "0.0026",         // Price level to be updated      "100"             // Quantity    ]  ]}
```

## Diff. Depth Stream[​](/docs/binance-spot-api-docs/web-socket-streams#diff-depth-stream "Direct link to Diff. Depth Stream")

Order book price and quantity depth updates used to locally manage an order book.

**Stream Name:** <symbol>@depth OR <symbol>@depth@100ms

**Update Speed:** 1000ms or 100ms

**Payload:**

```
{  "e": "depthUpdate", // Event type  "E": 1672515782136, // Event time  "s": "BNBBTC",      // Symbol  "U": 157,           // First update ID in event  "u": 160,           // Final update ID in event  "b": [              // Bids to be updated    [      "0.0024",       // Price level to be updated      "10"            // Quantity    ]  ],  "a": [              // Asks to be updated    [      "0.0026",       // Price level to be updated      "100"           // Quantity    ]  ]}
```

## How to manage a local order book correctly[​](/docs/binance-spot-api-docs/web-socket-streams#how-to-manage-a-local-order-book-correctly "Direct link to How to manage a local order book correctly")

1.  Open a WebSocket connection to `wss://stream.binance.com:9443/ws/bnbbtc@depth`.
2.  Buffer the events received from the stream. Note the `U` of the first event you received.
3.  Get a depth snapshot from `https://api.binance.com/api/v3/depth?symbol=BNBBTC&limit=5000`.
4.  If the `lastUpdateId` from the snapshot is strictly less than the `U` from step 2, go back to step 3.
5.  In the buffered events, discard any event where `u` is <= `lastUpdateId` of the snapshot. The first buffered event should now have `lastUpdateId` within its `[U;u]` range.
6.  Set your local order book to the snapshot. Its update ID is `lastUpdateId`.
7.  Apply the update procedure below to all buffered events, and then to all subsequent events received.

To apply an event to your local order book, follow this update procedure:

1.  If the event `u` (last update ID) is < the update ID of your local order book, ignore the event.
2.  If the event `U` (first update ID) is > the update ID of your local order book, something went wrong. Discard your local order book and restart the process from the beginning.
3.  For each price level in bids (`b`) and asks (`a`), set the new quantity in the order book:
    -   If the price level does not exist in the order book, insert it with new quantity.
    -   If the quantity is zero, remove the price level from the order book.
4.  Set the order book update ID to the last update ID (`u`) in the processed event.

> \[!NOTE\] Since depth snapshots retrieved from the API have a limit on the number of price levels (5000 on each side maximum), you won't learn the quantities for the levels outside of the initial snapshot unless they change.  
> So be careful when using the information for those levels, since they might not reflect the full view of the order book.  
> However, for most use cases, seeing 5000 levels on each side is enough to understand the market and trade effectively.

-   [General WSS information](/docs/binance-spot-api-docs/web-socket-streams#general-wss-information)
-   [WebSocket Limits](/docs/binance-spot-api-docs/web-socket-streams#websocket-limits)
-   [Live Subscribing/Unsubscribing to streams](/docs/binance-spot-api-docs/web-socket-streams#live-subscribingunsubscribing-to-streams)
    -   [Subscribe to a stream](/docs/binance-spot-api-docs/web-socket-streams#subscribe-to-a-stream)
    -   [Unsubscribe to a stream](/docs/binance-spot-api-docs/web-socket-streams#unsubscribe-to-a-stream)
    -   [Listing Subscriptions](/docs/binance-spot-api-docs/web-socket-streams#listing-subscriptions)
    -   [Setting Properties](/docs/binance-spot-api-docs/web-socket-streams#setting-properties)
    -   [Retrieving Properties](/docs/binance-spot-api-docs/web-socket-streams#retrieving-properties)
    -   [Error Messages](/docs/binance-spot-api-docs/web-socket-streams#error-messages)
-   [Aggregate Trade Streams](/docs/binance-spot-api-docs/web-socket-streams#aggregate-trade-streams)
-   [Trade Streams](/docs/binance-spot-api-docs/web-socket-streams#trade-streams)
-   [Kline/Candlestick Streams for UTC](/docs/binance-spot-api-docs/web-socket-streams#klinecandlestick-streams-for-utc)
-   [Kline/Candlestick Streams with timezone offset](/docs/binance-spot-api-docs/web-socket-streams#klinecandlestick-streams-with-timezone-offset)
-   [Individual Symbol Mini Ticker Stream](/docs/binance-spot-api-docs/web-socket-streams#individual-symbol-mini-ticker-stream)
-   [All Market Mini Tickers Stream](/docs/binance-spot-api-docs/web-socket-streams#all-market-mini-tickers-stream)
-   [Individual Symbol Ticker Streams](/docs/binance-spot-api-docs/web-socket-streams#individual-symbol-ticker-streams)
-   [All Market Tickers Stream](/docs/binance-spot-api-docs/web-socket-streams#all-market-tickers-stream)
-   [Individual Symbol Rolling Window Statistics Streams](/docs/binance-spot-api-docs/web-socket-streams#individual-symbol-rolling-window-statistics-streams)
-   [All Market Rolling Window Statistics Streams](/docs/binance-spot-api-docs/web-socket-streams#all-market-rolling-window-statistics-streams)
-   [Individual Symbol Book Ticker Streams](/docs/binance-spot-api-docs/web-socket-streams#individual-symbol-book-ticker-streams)
-   [Average Price](/docs/binance-spot-api-docs/web-socket-streams#average-price)
-   [Partial Book Depth Streams](/docs/binance-spot-api-docs/web-socket-streams#partial-book-depth-streams)
-   [Diff. Depth Stream](/docs/binance-spot-api-docs/web-socket-streams#diff-depth-stream)
-   [How to manage a local order book correctly](/docs/binance-spot-api-docs/web-socket-streams#how-to-manage-a-local-order-book-correctly)


	

HMAC-SHA-256 Key registered

Save these values right now. They won't be shown ever again!

API Key: gy7BWAiu6fNUqh914ZO80KGb0oWBAovwSDh5u0JNyVdW5P6w5vmRCBknG1zPWRns

Secret Key: tQvL4w2jMVSCc6fi4cDR1rltFqdwvTSpuzsGMLEnXQp4BsrEXZoyRecrCHp3zCS8


## Bug Fix: Trade Execute Route 404 Error (Nov 12, 2025)

**Issue**: `GET /trades/execute?signalId=...` returning 404 errors
**Root Cause**: Missing page route - only API endpoint existed at `/api/trades/execute`
**Fix**: Created `app/trades/execute/page.tsx` (318 lines) with:
- Signal details display (symbol, entries, targets, stop loss, risk/reward)
- Position sizing UI (fixed amount, percentage, risk-based)
- Execute confirmation button
- Error handling and redirects
**Result**: Route now returns 200, users can execute trades with confirmation

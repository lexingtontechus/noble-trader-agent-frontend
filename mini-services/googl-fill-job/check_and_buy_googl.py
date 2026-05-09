#!/usr/bin/env python3
"""
Scheduled job: Check if sell orders have filled, then place remaining GOOGL order.
Target: 96 total GOOGL shares. Already ordered: 44. Remaining: 52.
Market opens Monday May 11, 2026 at 9:30 AM ET. This runs ~30 min after open.
"""
import json, urllib.request, sys, time

ALPACA_KEY = "PKGWIARSN3LWH4JUWYHT2RFECW"
ALPACA_SECRET = "6QnZD1kog7PaEBfZg4Vebfr9FJLC5LrYDsPUsu1Qmg68"
ALPACA_BASE = "https://paper-api.alpaca.markets/v2"

REMAINING_GOOGL = 52
GOOGL_LIMIT_PRICE = 398  # limit price for buy order

def alpaca_get(endpoint):
    url = f"{ALPACA_BASE}{endpoint}"
    req = urllib.request.Request(url, headers={
        "APCA-API-KEY-ID": ALPACA_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"GET error: {e}", file=sys.stderr)
        return None

def alpaca_post(endpoint, body):
    url = f"{ALPACA_BASE}{endpoint}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={
        "APCA-API-KEY-ID": ALPACA_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET,
        "Content-Type": "application/json"
    }, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if e.fp else ""
        print(f"POST error {e.code}: {err_body}", file=sys.stderr)
        return {"error": True, "code": e.code, "message": err_body}
    except Exception as e:
        print(f"POST error: {e}", file=sys.stderr)
        return {"error": True, "message": str(e)}

def main():
    print("=" * 70)
    print("GOOGL REMAINING ORDER JOB")
    print(f"Time: {time.strftime('%Y-%m-%d %H:%M:%S %Z')}")
    print("=" * 70)
    
    # Step 1: Check if market is open
    clock = alpaca_get("/clock")
    if not clock:
        print("Cannot get market clock. Exiting.")
        sys.exit(1)
    
    if not clock.get("is_open", False):
        print(f"Market is CLOSED. Next open: {clock.get('next_open')}. Exiting.")
        sys.exit(0)
    
    print("Market is OPEN")
    
    # Step 2: Check account buying power
    account = alpaca_get("/account")
    if not account:
        print("Cannot get account info. Exiting.")
        sys.exit(1)
    
    buying_power = float(account.get("buying_power", 0))
    cash = float(account.get("cash", 0))
    equity = float(account.get("equity", 0))
    print(f"  Equity: ${equity:,.2f} | Cash: ${cash:,.2f} | Buying Power: ${buying_power:,.2f}")
    
    # Step 3: Check existing sell orders status
    orders = alpaca_get("/orders?status=all&direction=desc&limit=20")
    if not orders:
        print("Cannot get orders. Exiting.")
        sys.exit(1)
    
    sell_symbols = ["SPY", "AAPL", "MRSH", "META", "MSFT", "BTC"]
    sell_summary = {}
    for o in orders:
        sym = o["symbol"]
        if o["side"] == "sell" and sym in sell_symbols:
            sell_summary[sym] = {
                "status": o["status"],
                "filled_qty": o.get("filled_qty", "0"),
                "filled_avg_price": o.get("filled_avg_price"),
            }
    
    print(f"\n  Sell Order Status:")
    all_sells_done = True
    for sym in sell_symbols:
        info = sell_summary.get(sym, {"status": "not_found"})
        status = info["status"]
        filled = info.get("filled_qty", "?")
        if status not in ["filled", "canceled", "expired", "replaced"]:
            all_sells_done = False
        marker = "DONE" if status == "filled" else ("PENDING" if status in ["accepted", "new", "pending_new", "partially_filled"] else "OTHER")
        print(f"    {sym}: {status} (filled: {filled}) [{marker}]")
    
    # Step 4: Check existing GOOGL position + pending orders
    googl_position = alpaca_get("/positions/GOOGL")
    current_googl_qty = 0
    if googl_position and "qty" in googl_position:
        current_googl_qty = int(float(googl_position["qty"]))
    print(f"\n  Current GOOGL position: {current_googl_qty} shares")
    
    # Check pending GOOGL buy orders
    pending_googl_buys = 0
    for o in orders:
        if o["symbol"] == "GOOGL" and o["side"] == "buy" and o["status"] in ["accepted", "new", "pending_new", "partially_filled"]:
            pending_googl_buys += int(float(o["qty"]))
            print(f"    Pending GOOGL buy: {o['qty']} shares (status: {o['status']}, limit: {o.get('limit_price')})")
    
    total_googl_after_pending = current_googl_qty + pending_googl_buys
    remaining_needed = max(0, 96 - total_googl_after_pending)
    
    print(f"  GOOGL after pending fills: {total_googl_after_pending} shares")
    print(f"  Remaining needed for target (96): {remaining_needed} shares")
    
    # Step 5: Place remaining GOOGL order if needed
    if remaining_needed <= 0:
        print(f"\nNo additional GOOGL shares needed. Target of 96 already covered.")
        sys.exit(0)
    
    # Check if we have enough buying power
    est_cost = remaining_needed * GOOGL_LIMIT_PRICE
    print(f"\n  Need to buy {remaining_needed} more GOOGL @ ~${GOOGL_LIMIT_PRICE} = ~${est_cost:,.2f}")
    
    if buying_power < est_cost:
        print(f"WARNING: Insufficient buying power (${buying_power:,.2f} < ${est_cost:,.2f})")
        
        # If sells filled but not enough BP, try smaller order
        affordable_qty = int(buying_power / GOOGL_LIMIT_PRICE)
        if affordable_qty > 0:
            remaining_needed = affordable_qty
            print(f"   Adjusting to {affordable_qty} shares (what we can afford)")
        else:
            print("   Cannot afford any shares. Will need manual intervention.")
            sys.exit(1)
    
    # Place the order
    print(f"\n>>> Placing BUY order: {remaining_needed} GOOGL @ ${GOOGL_LIMIT_PRICE} limit, GTC")
    result = alpaca_post("/orders", {
        "symbol": "GOOGL",
        "qty": str(remaining_needed),
        "side": "buy",
        "type": "limit",
        "limit_price": GOOGL_LIMIT_PRICE,
        "time_in_force": "gtc"
    })
    
    if result.get("error"):
        print(f"Order failed: {result.get('message', 'Unknown error')}")
        sys.exit(1)
    else:
        print(f"Order placed successfully!")
        print(f"   ID: {result.get('id', 'N/A')}")
        print(f"   Status: {result.get('status', 'N/A')}")
        print(f"   Qty: {result.get('qty', 'N/A')}")
        print(f"   Limit: ${result.get('limit_price', 'N/A')}")
        print(f"   TIF: {result.get('time_in_force', 'N/A')}")
    
    print("\n" + "=" * 70)
    print("JOB COMPLETE")
    print("=" * 70)

if __name__ == "__main__":
    main()

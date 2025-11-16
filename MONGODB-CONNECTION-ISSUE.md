# MongoDB Connection Issue - Port 5999 Unreachable

**Issue**: `MongooseServerSelectionError: connect ETIMEDOUT 66.179.240.208:5999`

**Diagnosis**: TCP connection to MongoDB server TIMES OUT - port 5999 is not reachable.

---

## Root Cause

Port 5999 is **blocked or closed**. This can happen due to:

1. **IONOS Firewall Rule Disabled/Removed** (Most Likely)
2. **MongoDB Server Stopped**
3. **Network Configuration Changed**

---

## Previous Resolution (Nov 10, 2025)

According to `CLAUDE.md`, this same issue was resolved before by:
> "IONOS Network Firewall blocking port 5999. User enabled port 5999 in IONOS firewall. Connected successfully in 1.40s"

**Conclusion**: The firewall rule was likely removed or disabled again.

---

## Solution: Re-enable Port 5999 in IONOS Firewall

### Step 1: Access IONOS Control Panel

1. Go to https://my.ionos.com
2. Login with your credentials
3. Navigate to your VPS/Server

### Step 2: Configure Firewall

**Option A: IONOS Control Panel**
1. Click on **"Network"** or **"Firewall"** section
2. Find **"Firewall Rules"**
3. Add/Enable rule for port **5999**:
   - **Protocol**: TCP
   - **Port**: 5999
   - **Direction**: Inbound (Incoming)
   - **Source**: 0.0.0.0/0 (Allow all - or restrict to your IP)
   - **Action**: ALLOW

**Option B: Via SSH (if you have access)**
```bash
# SSH into the VPS
ssh user@66.179.240.208

# Check if MongoDB is running
sudo systemctl status mongod

# If MongoDB is running, check firewall
sudo ufw status

# If port 5999 is not listed, add it:
sudo ufw allow 5999/tcp
sudo ufw reload

# Verify the rule was added
sudo ufw status numbered
```

### Step 3: Verify MongoDB is Running

While SSH'd into the VPS:
```bash
# Check MongoDB service status
sudo systemctl status mongod

# If stopped, start it:
sudo systemctl start mongod

# Check if MongoDB is listening on port 5999
sudo netstat -tuln | grep 5999
# Should show: tcp  0  0  0.0.0.0:5999  0.0.0.0:*  LISTEN

# Check MongoDB logs for errors
sudo tail -f /var/log/mongodb/mongod.log
```

### Step 4: Test Connection

After enabling the firewall rule, run our diagnostic script:
```bash
node test-mongodb-connection.js
```

Expected output:
```
✅ TCP Connection: SUCCESS (port 5999 is open)
✅ Mongoose Connection: SUCCESS
=== ALL TESTS PASSED ===
```

---

## Alternative: Check MongoDB Configuration

If the firewall is open but connection still fails, verify MongoDB config:

```bash
# Check MongoDB config file
sudo cat /etc/mongod.conf | grep -A 5 "net:"

# Should show:
# net:
#   port: 5999
#   bindIp: 0.0.0.0  # Important: Must allow external connections
```

If `bindIp` is set to `127.0.0.1`, MongoDB only accepts local connections. Change to:
```yaml
net:
  port: 5999
  bindIp: 0.0.0.0  # Allow all IPs
```

Then restart MongoDB:
```bash
sudo systemctl restart mongod
```

---

## Quick Fix: Use MongoDB Atlas (Cloud Alternative)

If you can't access the VPS or want a more reliable solution:

1. Create free cluster at https://cloud.mongodb.com
2. Get connection string (looks like: `mongodb+srv://user:pass@cluster.mongodb.net/`)
3. Update `.env.local`:
   ```env
   DATABASE_URL="mongodb+srv://username:password@cluster.mongodb.net/cartelbot?retryWrites=true&w=majority"
   ```
4. Restart dev server

**Pros**: No firewall issues, managed backups, always available
**Cons**: External dependency, potential latency

---

## Verification Checklist

After applying the fix:

- [ ] Firewall rule added/enabled for port 5999
- [ ] MongoDB service is running (`systemctl status mongod`)
- [ ] MongoDB is listening on port 5999 (`netstat -tuln | grep 5999`)
- [ ] MongoDB bindIp is set to 0.0.0.0 (allows external connections)
- [ ] Diagnostic script passes (`node test-mongodb-connection.js`)
- [ ] Dev server can connect (restart and check logs)

---

## Expected Timeline

Once port 5999 is opened:
- **Connection should work immediately** (within 1-2 seconds)
- **Previous resolution**: Connected successfully in 1.40s

If it still doesn't work after 30 seconds, the issue is not the firewall.

---

**Last Updated**: 2025-11-15
**Related**: MONGODB-CONNECTIVITY-RESOLVED.md (Nov 10, 2025 fix)

class VPNDetector {
	constructor(clientIP) {
		this.clientIP = clientIP;
		this.leakedIP = null;
		this.vpnResult = '';
		this.knownVPNISPs = ['aws', 'alibaba', 'ovh', 'ionos'];
		this.ISPRegex = new RegExp(this.knownVPNISPs.join('|'), 'i');
	}

	async detect() {
		try {
			if (!this.clientIP || !this.isValidIP(this.clientIP)) {
				this.vpnResult = 'Invalid IP address';
				return this.vpnResult;
			}

			if (this.isWebRTCAvailable()) {
				this.leakedIP = await this.getWebRTCIPLeak();

				if (!this.leakedIP || !this.isValidIP(this.leakedIP)) {
					return await this.checkISP();
				}

				if (this.leakedIP !== this.clientIP) {
					this.vpnResult = 'VPN Detected';
					return this.vpnResult;
				} else {
					return await this.checkISP();
				}
			} else {
				console.warn('WebRTC is disabled or blocked.');
				return await this.checkISP();
			}
		} catch (error) {
			console.error('Detection failed:', error);
			this.vpnResult = 'VPN status unknown.';
			return this.vpnResult;
		}
	}

	isValidIP(ip) {
		// Must match IPv4 format
		const regex = /^(\d{1,3}\.){3}\d{1,3}$/;
		if (!regex.test(ip)) return false;

		const parts = ip.split('.').map(Number);
		if (parts.some(part => part < 0 || part > 255)) return false;

		// Check for private/reserved ranges
		const [a, b] = parts;

		if (
			a === 10 ||                             // 10.0.0.0 – 10.255.255.255
			(a === 172 && b >= 16 && b <= 31) ||   // 172.16.0.0 – 172.31.255.255
			(a === 192 && b === 168) ||            // 192.168.0.0 – 192.168.255.255
			ip === "127.0.0.1"                     // Loopback
		) {
			return false;
		}

		return true;
	}

	isWebRTCAvailable() {
		return !!(window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);
	}

	async getWebRTCIPLeak() {
		return new Promise((resolve) => {
			const RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;

			const pc = new RTCPeerConnection({
				iceServers: [
					{ urls: 'stun:stun.l.google.com:19302' },
					{ urls: 'stun:stun.12connect.com' },
					{ urls: 'stun:stun.services.mozilla.com' }
				]
			});

			pc.createDataChannel('');
			pc.createOffer()
				.then(offer => pc.setLocalDescription(offer))
				.catch(() => resolve(null));

			pc.onicecandidate = (e) => {
				if (!e.candidate) {
					pc.close();
					resolve(null);
				} else if (e.candidate.candidate.includes('typ srflx')) {
					const match = e.candidate.candidate.match(/([0-9]{1,3}(?:\.[0-9]{1,3}){3})/);
					if (match) {
						pc.close();
						resolve(match[1]);
					}
				}
			};
		});
	}

	async checkISP() {
		const methods = [
			this.checkWithIPWhois.bind(this),
			this.checkWithIPInfo.bind(this),
			this.checkWithIPApi.bind(this)
		];

		for (const method of methods) {
			const result = await method();
			if (result !== null) {
				this.vpnResult = result ? 'Not connected to VPN server' : 'VPN Detected';
				return this.vpnResult;
			}
		}

		this.vpnResult = 'VPN status unknown';
		return this.vpnResult;
	}

	async checkWithIPWhois() {
		try {
			const res = await fetch(`https://ipwho.is/${this.clientIP}`);
			if (!res.ok) return null;
			const data = await res.json();
			const org = (data.connection?.org || '').toLowerCase();
			const isp = (data.connection?.isp || '').toLowerCase();
			return !(this.ISPRegex.test(org) || this.ISPRegex.test(isp));
		} catch {
			return null;
		}
	}

	async checkWithIPInfo() {
		try {
			const res = await fetch(`https://ipinfo.io/${this.clientIP}/json`);
			if (!res.ok) return null;
			const data = await res.json();
			const org = (data.org || '').toLowerCase();
			return !this.ISPRegex.test(org);
		} catch {
			return null;
		}
	}

	async checkWithIPApi() {
		try {
			const res = await fetch(`https://ip-api.com/json/${this.clientIP}`);
			if (!res.ok) return null;
			const data = await res.json();
			const isp = (data.isp || '').toLowerCase();
			const org = (data.org || '').toLowerCase();
			return !(this.ISPRegex.test(isp) || this.ISPRegex.test(org));
		} catch {
			return null;
		}
	}
}

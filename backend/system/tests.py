import shutil
import tempfile
from pathlib import Path

from django.test import RequestFactory, TestCase, override_settings

from .audit import get_client_ip


class ClientIpTests(TestCase):
	def setUp(self):
		self.factory = RequestFactory()

	@override_settings(TRUSTED_PROXY_IPS=['192.168.44.10'])
	def test_forwarded_ip_is_used_from_trusted_proxy(self):
		request = self.factory.get(
			'/',
			HTTP_X_FORWARDED_FOR='203.0.113.25, 192.168.44.10',
			REMOTE_ADDR='192.168.44.10',
		)

		self.assertEqual(get_client_ip(request), '203.0.113.25')

	@override_settings(TRUSTED_PROXY_IPS=['192.168.44.10'])
	def test_forwarded_ip_is_ignored_from_untrusted_peer(self):
		request = self.factory.get(
			'/',
			HTTP_X_FORWARDED_FOR='192.168.44.10',
			REMOTE_ADDR='203.0.113.25',
		)

		self.assertEqual(get_client_ip(request), '203.0.113.25')


@override_settings(ALLOWED_HOSTS=['*'])
class ScannerBlockAndWellKnownRoutingTests(TestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.temp_dir = Path(tempfile.mkdtemp())
		(cls.temp_dir / 'index.html').write_text('<!doctype html><html>SPA</html>', encoding='utf-8')
		(cls.temp_dir / 'sw.js').write_text('// service worker', encoding='utf-8')
		challenge_dir = cls.temp_dir / '.well-known' / 'acme-challenge'
		challenge_dir.mkdir(parents=True, exist_ok=True)
		(challenge_dir / 'valid-token-123').write_text('challenge-response-xyz', encoding='utf-8')

	@classmethod
	def tearDownClass(cls):
		shutil.rmtree(cls.temp_dir, ignore_errors=True)
		super().tearDownClass()

	def test_scanner_probes_return_404_and_not_spa_or_audit_pollution(self):
		from .models import AuditLog

		before_audit_count = AuditLog.objects.count()
		probes = [
			'/config/config.js',
			'/storage/logs/laravel.log',
			'/.env.local',
			'/.well-known/ccc.php',
			'/.well-known/acme-challenge/shell.php',
			'/actuator/env',
			'/config.json',
		]
		for path in probes:
			res = self.client.get(path)
			self.assertEqual(res.status_code, 404, msg=f'{path} should return 404')
			self.assertNotIn(b'<!doctype html>', res.content.lower())

		res_api_probe = self.client.post('/api/v1/validate/code', data={'code': '1'}, content_type='application/json')
		self.assertEqual(res_api_probe.status_code, 404)

		res_gql_probe = self.client.post('/api/graphql', data={'query': '{}'}, content_type='application/json')
		self.assertEqual(res_gql_probe.status_code, 404)
		self.assertEqual(AuditLog.objects.count(), before_audit_count)

	def test_acme_challenge_preserved_and_missing_returns_404(self):
		from django.http import Http404, HttpResponse
		from django.urls import Resolver404, resolve
		from .middleware import BlockExploitScannersMiddleware

		factory = RequestFactory()
		passthrough = BlockExploitScannersMiddleware(lambda req: HttpResponse('OK'))

		# Middleware tidak pernah memblokir path challenge SSL meski token acak berisi substring pola
		for path in (
			'/.well-known/acme-challenge/valid-token-123',
			'/.well-known/acme-challenge/token_shell_test_999',
			'/.well-known/pki-validation/fileauth.txt',
		):
			mw_res = passthrough(factory.get(path))
			self.assertEqual(mw_res.status_code, 200, msg=f'Middleware blocked safe challenge path: {path}')

		with override_settings(STATIC_ROOT=str(self.temp_dir)):
			# Challenge token yang eksis harus dapat dilayani (aman untuk SSL renewal)
			res_ok = self.client.get('/.well-known/acme-challenge/valid-token-123')
			self.assertEqual(res_ok.status_code, 200)
			body_ok = b''.join(res_ok.streaming_content)
			if getattr(res_ok, 'file_to_stream', None):
				res_ok.file_to_stream.close()
			self.assertEqual(body_ok, b'challenge-response-xyz')

			# Challenge token yang tidak ada merespons via well_known_serve (Http404), bukan SPA fallback
			match_missing = resolve('/.well-known/acme-challenge/token_shell_test_999')
			self.assertEqual(match_missing.view_name, 'well_known_serve')
			with self.assertRaises(Http404):
				match_missing.func(
					factory.get('/.well-known/acme-challenge/token_shell_test_999'),
					**match_missing.kwargs,
				)

			# File ekstensi non-SPA (misal .js/.log) tidak boleh jatuh ke spa_fallback
			with self.assertRaises(Resolver404):
				resolve('/config/config.js')
			with self.assertRaises(Resolver404):
				resolve('/storage/logs/laravel.log')

			# Root asset & SPA route (termasuk kode aset bertitik angka) tetap berfungsi
			res_sw = self.client.get('/sw.js')
			self.assertEqual(res_sw.status_code, 200)
			body_sw = b''.join(res_sw.streaming_content)
			if getattr(res_sw, 'file_to_stream', None):
				res_sw.file_to_stream.close()
			self.assertEqual(body_sw, b'// service worker')

			self.assertEqual(resolve('/login').view_name, 'spa_fallback')
			self.assertEqual(resolve('/aset/AM.USG.2026.0001').view_name, 'spa_fallback')

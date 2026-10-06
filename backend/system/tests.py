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

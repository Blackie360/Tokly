param([string]$Action)
$vault = New-Object Windows.Security.Credentials.PasswordVault
if ($Action -eq "store") { $secret = [Console]::In.ReadToEnd(); $vault.Add((New-Object Windows.Security.Credentials.PasswordCredential("Tokly", $env:COMPUTERNAME, $secret))); exit 0 }
$items = $vault.FindAllByResource("Tokly")
if ($items.Count -eq 0) { exit 1 }
$item = $items[0]; $item.RetrievePassword()
if ($Action -eq "read") { [Console]::Out.Write($item.Password); exit 0 }
$vault.Remove($item)

package main

import (
  "net"
  "os"
)

func isPrivateIP(ip net.IP, privateIPBlocks []*net.IPNet) bool {
  for _, block := range privateIPBlocks {
    if block.Contains(ip) {
      return true
    }
  }
  return false
}

func getLocalIpAddr() string {
  var privateIPBlocks []*net.IPNet
  result := ""
  ifaces, _ := net.Interfaces()

  for _, cidr := range []string{
    "127.0.0.0/8",    // IPv4 loopback
    "10.0.0.0/8",     // RFC1918
    "172.16.0.0/12",  // RFC1918
    "192.168.0.0/16", // RFC1918
    "::1/128",        // IPv6 loopback
    "fe80::/10",      // IPv6 link-local
  } {
    _, block, _ := net.ParseCIDR(cidr)
    privateIPBlocks = append(privateIPBlocks, block)
  }

  // handle err
  OuterLoop:
  for _, i := range ifaces {
    addrs, _ := i.Addrs()
    // handle err
    for _, addr := range addrs {
      var ip net.IP
      switch v := addr.(type) {
      case *net.IPNet:
        ip = v.IP
      case *net.IPAddr:
        ip = v.IP
      }

      ipv4 := ip.To4()

      if ipv4 != nil && !ipv4.Equal(net.IPv4(127, 0, 0, 1)) && isPrivateIP(ipv4, privateIPBlocks) {
        result = ipv4.String()
        break OuterLoop
      }

    }
  }

  return result
}

func getCommand(args []string) string {
  var command string

  if len(os.Args) == 0 {
    return  command
  }

  command = os.Args[1]

  return command
}
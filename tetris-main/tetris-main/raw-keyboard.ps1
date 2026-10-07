$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class CurtrisRawKb : Form {
  const int WM_INPUT = 0x00FF;
  const int RID_INPUT = 0x10000003;
  const int RIM_TYPEKEYBOARD = 1;
  const int RIDEV_INPUTSINK = 0x00000100;
  const int RI_KEY_BREAK = 1;

  [StructLayout(LayoutKind.Sequential)]
  struct RAWINPUTDEVICE {
    public ushort usUsagePage;
    public ushort usUsage;
    public uint dwFlags;
    public IntPtr hwndTarget;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct RAWINPUTHEADER {
    public uint dwType;
    public uint dwSize;
    public IntPtr hDevice;
    public IntPtr wParam;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct RAWKEYBOARD {
    public ushort MakeCode;
    public ushort Flags;
    public ushort Reserved;
    public ushort VKey;
    public uint Message;
    public uint ExtraInformation;
  }

  [DllImport("user32.dll")]
  static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] pRawInputDevices, uint uiNumDevices, uint cbSize);

  [DllImport("user32.dll")]
  static extern uint GetRawInputData(IntPtr hRawInput, uint uiCommand, IntPtr pData, ref uint pcbSize, uint cbSizeHeader);

  public CurtrisRawKb() {
    ShowInTaskbar = false;
    FormBorderStyle = FormBorderStyle.FixedToolWindow;
    Opacity = 0;
    Size = new System.Drawing.Size(1, 1);
    StartPosition = FormStartPosition.Manual;
    Location = new System.Drawing.Point(-4000, -4000);
  }

  protected override void OnHandleCreated(EventArgs e) {
    base.OnHandleCreated(e);
    var rid = new RAWINPUTDEVICE[1];
    rid[0].usUsagePage = 1;
    rid[0].usUsage = 6;
    rid[0].dwFlags = (uint)RIDEV_INPUTSINK;
    rid[0].hwndTarget = Handle;
    RegisterRawInputDevices(rid, 1, (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICE)));
    Console.WriteLine("{\"type\":\"hello\"}");
    Console.Out.Flush();
  }

  protected override void WndProc(ref Message m) {
    if (m.Msg == WM_INPUT) ReadRaw(m.LParam);
    base.WndProc(ref m);
  }

  void ReadRaw(IntPtr hRawInput) {
    uint size = 0;
    uint headerSize = (uint)Marshal.SizeOf(typeof(RAWINPUTHEADER));
    GetRawInputData(hRawInput, (uint)RID_INPUT, IntPtr.Zero, ref size, headerSize);
    if (size == 0) return;
    IntPtr buf = Marshal.AllocHGlobal((int)size);
    try {
      if (GetRawInputData(hRawInput, (uint)RID_INPUT, buf, ref size, headerSize) == 0) return;
      var header = Marshal.PtrToStructure<RAWINPUTHEADER>(buf);
      if (header.dwType != RIM_TYPEKEYBOARD) return;
      IntPtr kbPtr = IntPtr.Add(buf, (int)headerSize);
      var kb = Marshal.PtrToStructure<RAWKEYBOARD>(kbPtr);
      if (kb.VKey == 0 || kb.VKey == 255) return;
      bool down = (kb.Flags & RI_KEY_BREAK) == 0;
      long id = header.hDevice.ToInt64();
      Console.WriteLine("{\"type\":\"key\",\"id\":\"" + id + "\",\"vk\":" + kb.VKey + ",\"down\":" + (down ? "true" : "false") + "}");
      Console.Out.Flush();
    } finally {
      Marshal.FreeHGlobal(buf);
    }
  }

  [STAThread]
  public static void Main() {
    Console.OutputEncoding = System.Text.Encoding.UTF8;
    Application.Run(new CurtrisRawKb());
  }
}
"@
[CurtrisRawKb]::Main()

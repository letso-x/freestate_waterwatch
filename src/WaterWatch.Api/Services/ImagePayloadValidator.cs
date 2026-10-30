using System.Buffers.Binary;
using WaterWatch.Api.Errors;

namespace WaterWatch.Api.Services;

public sealed record ValidatedImage(byte[] Bytes, string ContentType, string Extension);

public static class ImagePayloadValidator
{
    public const int MaximumBytes = 5 * 1024 * 1024;
    private static readonly byte[] PngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

    public static async Task<ValidatedImage> ReadAsync(IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length is < 1 or > MaximumBytes)
            throw new IncidentWorkflowException(400, "Each photo must be between 1 byte and 5 MB.");
        await using var input = file.OpenReadStream();
        using var output = new MemoryStream((int)file.Length);
        await input.CopyToAsync(output, cancellationToken);
        if (output.Length != file.Length || output.Length > MaximumBytes)
            throw new IncidentWorkflowException(400, "The photo is incomplete or exceeds the 5 MB limit.");
        var bytes = output.ToArray();
        return bytes switch
        {
            _ when IsJpeg(bytes) => SanitizeJpeg(bytes),
            _ when IsPng(bytes) => SanitizePng(bytes),
            _ when IsWebP(bytes) => ValidateWebP(bytes),
            _ => throw new IncidentWorkflowException(400, "Choose a valid JPEG, PNG or WebP photo.")
        };
    }

    private static bool IsJpeg(byte[] bytes) => bytes.Length >= 4 &&
        bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[^2] == 0xff && bytes[^1] == 0xd9;

    private static ValidatedImage SanitizeJpeg(byte[] bytes)
    {
        using var cleaned = new MemoryStream(bytes.Length);
        cleaned.Write(bytes, 0, 2);
        var position = 2;
        var hasFrame = false;
        var hasScan = false;
        while (position < bytes.Length)
        {
            var start = position;
            if (bytes[position++] != 0xff)
                throw Invalid();
            while (position < bytes.Length && bytes[position] == 0xff) position++;
            if (position >= bytes.Length) throw Invalid();
            var marker = bytes[position++];
            if (marker == 0xda)
            {
                if (!hasFrame || position + 2 > bytes.Length) throw Invalid();
                var length = BinaryPrimitives.ReadUInt16BigEndian(bytes.AsSpan(position, 2));
                if (length < 2 || position + length > bytes.Length - 2) throw Invalid();
                cleaned.Write(bytes, start, bytes.Length - start);
                hasScan = true;
                break;
            }
            if (marker == 0xd9) break;
            if (marker is >= 0xd0 and <= 0xd7 or 0x01) continue;
            if (position + 2 > bytes.Length) throw Invalid();
            var segmentLength = BinaryPrimitives.ReadUInt16BigEndian(bytes.AsSpan(position, 2));
            var end = position + segmentLength;
            if (segmentLength < 2 || end > bytes.Length - 2) throw Invalid();
            if (marker is >= 0xc0 and <= 0xcf && marker is not (0xc4 or 0xc8 or 0xcc))
            {
                if (segmentLength < 8 || BinaryPrimitives.ReadUInt16BigEndian(bytes.AsSpan(position + 3, 2)) == 0 ||
                    BinaryPrimitives.ReadUInt16BigEndian(bytes.AsSpan(position + 5, 2)) == 0) throw Invalid();
                hasFrame = true;
            }
            if (marker is not (0xe1 or 0xed))
                cleaned.Write(bytes, start, end - start);
            position = end;
        }
        if (!hasScan) throw Invalid();
        return new ValidatedImage(bytes, "image/jpeg", ".jpg");
    }

    private static bool IsPng(byte[] bytes) => bytes.Length >= 33 && bytes.AsSpan(0, 8).SequenceEqual(PngSignature);

    private static ValidatedImage SanitizePng(byte[] bytes)
    {
        using var cleaned = new MemoryStream(bytes.Length);
        cleaned.Write(PngSignature);
        var position = 8;
        var hasHeader = false;
        var hasData = false;
        var hasEnd = false;
        while (position + 12 <= bytes.Length)
        {
            var start = position;
            var length = BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(position, 4));
            if (length > MaximumBytes || position + 12L + length > bytes.Length) throw Invalid();
            position += 4;
            var type = System.Text.Encoding.ASCII.GetString(bytes, position, 4);
            position += 4;
            var dataLength = (int)length;
            if (type == "IHDR")
            {
                if (hasHeader || dataLength != 13 || BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(position, 4)) == 0 ||
                    BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(position + 4, 4)) == 0) throw Invalid();
                hasHeader = true;
            }
            else if (!hasHeader) throw Invalid();
            if (type == "IDAT") hasData = true;
            var crcStart = position - 4;
            position += dataLength;
            var expectedCrc = BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(position, 4));
            if (Crc32(bytes.AsSpan(crcStart, dataLength + 4)) != expectedCrc) throw Invalid();
            position += 4;
            if (type == "IEND")
            {
                if (dataLength != 0) throw Invalid();
                hasEnd = true;
                if (position != bytes.Length) throw Invalid();
                break;
            }
            if (type is not ("eXIf" or "tEXt" or "iTXt" or "zTXt"))
                cleaned.Write(bytes, start, position - start);
        }
        if (!hasHeader || !hasData || !hasEnd) throw Invalid();
        cleaned.Write(bytes, bytes.Length - 12, 12);
        return new ValidatedImage(bytes, "image/png", ".png");
    }

    private static bool IsWebP(byte[] bytes) => bytes.Length >= 20 &&
        bytes.AsSpan(0, 4).SequenceEqual("RIFF"u8) && bytes.AsSpan(8, 4).SequenceEqual("WEBP"u8);

    private static ValidatedImage ValidateWebP(byte[] bytes)
    {
        var declaredLength = BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(4, 4));
        if (declaredLength != bytes.Length - 8) throw Invalid();
        var position = 12;
        var hasImage = false;
        while (position + 8 <= bytes.Length)
        {
            var type = System.Text.Encoding.ASCII.GetString(bytes, position, 4);
            var length = BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(position + 4, 4));
            if (position + 8L + length + (length & 1) > bytes.Length) throw Invalid();
            if (type is "VP8 " or "VP8L" && length > 0) hasImage = true;
            position += 8 + (int)length + (int)(length & 1);
        }
        if (position != bytes.Length || !hasImage) throw Invalid();
        return new ValidatedImage(bytes, "image/webp", ".webp");
    }

    private static uint Crc32(ReadOnlySpan<byte> bytes)
    {
        uint crc = 0xffffffff;
        foreach (var value in bytes)
        {
            crc ^= value;
            for (var bit = 0; bit < 8; bit++)
                crc = (crc & 1) != 0 ? 0xedb88320 ^ (crc >> 1) : crc >> 1;
        }
        return ~crc;
    }

    private static IncidentWorkflowException Invalid() =>
        new(400, "This photo is incomplete or not a valid JPEG, PNG or WebP image.");
}

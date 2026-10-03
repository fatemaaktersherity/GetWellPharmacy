using System.Collections.Concurrent;
using System.Threading.Channels;

namespace PharmacyV2.Services;

/// <summary>In-process fan-out for notifying connected clients after API writes.</summary>
public sealed class LiveUpdateService
{
    private readonly ConcurrentDictionary<Guid, Channel<string>> _subscribers = new();

    public (Guid Id, ChannelReader<string> Reader) Subscribe()
    {
        var id = Guid.NewGuid();
        var channel = Channel.CreateBounded<string>(new BoundedChannelOptions(32)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = false
        });
        _subscribers[id] = channel;
        return (id, channel.Reader);
    }

    public void Unsubscribe(Guid id)
    {
        if (_subscribers.TryRemove(id, out var channel)) channel.Writer.TryComplete();
    }

    public void Publish(string resource)
    {
        var message = System.Text.Json.JsonSerializer.Serialize(new { resource, changedAt = DateTimeOffset.UtcNow });
        foreach (var subscriber in _subscribers.Values) subscriber.Writer.TryWrite(message);
    }
}
